var Genetic = require('genetic-js');
var _ = require('underscore');
var amqp = require('amqplib/callback_api');
var AMQPStats = require('amqp-stats');
var sleep = require('sleep').sleep; //in seconds

function waitUntillQueueEmpty(statsHost, password, queue, vhost) {
    vhost = vhost || 'vhost';
    queue = queue || 'aituning'
    var stats = new AMQPStats({
        username: "admin",
        password: password,//process.env.RABBITMQ_PASS,
        hostname: statsHost||'localhost:15672',//process.env.RABBITMQ_STATS_HOST||'localhost:15672'
    });
    return new Promise((resolve, reject)=>{
        function check(){
            var done = stats.getQueue(vhost, queue, (err, res, data)=>{
                if(err){ reject(err); return; }
                if(data.messages === 0){
                    resolve()
                } else {
                    setTimeout(check, 30*1000);
                }
            })
        }
        check();//start timeout loop
    })
}

function guid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {var r = Math.random()*16|0,v=c=='x'?r:r&0x3|0x8;return v.toString(16);});
}

function lerp(a, b, p) {
    return a + (b-a)*p;
}

function connectToRabbit(host, password){
    var url = `amqp://admin:${password||'admin'}@${host||'localhost:5672'}/vhost`;
    console.log("connecting to "+url);
    return new Promise((resolve,reject)=>{
        amqp.connect(url, function(err, conn){
            if(err){ reject(err); return; }
            conn.createChannel(function(err, ch) {
                console.log('created channel');
                if(err){ reject(err); return; }
                ch.assertQueue('aituning', {durable: false});
                ch.assertQueue('aituningRes', {durable: false});
                ch.prefetch(1); //XXX: do we rly only want to get 1 at a time?
                resolve([conn, ch]);
            })
        });
    })
}

function normalizeParamsVector(vector){
    var total = 0;
    _.mapObject(vector, (val, key)=>{
        if (_.isNumber(val)) total += val;
    });
    vector = _.mapObject(vector, (val, key)=>{
        return val/total;
    })
    vector.id = guid(); //XXX: not rly part of normalization but... meh
}

function selectRandomKey(entity) {
    var keys = _.keys(entity);
    return keys[_.random(0, keys.length-1)];
}

var genetic = Genetic.create();
genetic.fitnessData = {}
genetic.optimize = Genetic.Optimize.Maximize;
genetic.select1 = Genetic.Select1.Tournament2;
genetic.select2 = Genetic.Select2.FittestRandom;
genetic.seed = function(){
    return normalizeParamsVector({
        aiRatioOfBoard:Math.random(),
        aiRatioOfHexesAffordable:Math.random(),
        aiRatioOfDefendedHexes:Math.random(),
        aiRatioOfProfitableHexes:Math.random(),
        aiRatioOfBorderHexes:Math.random(),
        aiRatioOfDefendedBorderHexes:Math.random(),
    })
}
genetic.mutate = function(entity) {
    entity = _.extend({}, entity);
    key = selectRandomKey(entity);
    entity[key] += Math.random()-0.5;
    return normalizeParamsVector(entity);
}
genetic.crossover = function(mother, father) {
    var son = _.extend({}, father);
    var key = selectRandomKey(mother);
    son[key] = mother[key]
    var daughter = _.extend({}, mother);
    key = selectRandomKey(mother);
    mother[key] = father[key];
    return [son, daughter];
}
genetic.fitness = function(entity){
    genetic.queueEmptyPromise = genetic.queueEmptyPromise || waitUntillQueueEmpty(process.env.RABBITMQ_STATS_HOST, process.env.RABBITMQ_PASS);
    return genetic.queueEmptyPromise.then(()=>{
        var fitness = genetic.fitnessData[entity.id]
        if(!fitness) return 0; //no data is a 0
        return _.reduce(fitness, (memo, num)=>memo+num, 0) / fitness.length;
    });
}
genetic.generation = function(pop, generation, stats){
    genetic.fitnessData = {};
    genetic.queueEmptyPromise = null;
    return true;
}
genetic.notification = function(pop, generation, stats, isFinished){
    console.log("Finished generation #", generation)
    console.log("Stats = "+JSON.stringify(stats))
    console.log("Population:");
    console.log(JSON.stringify(pop))
}

var rabbitConnectPromise = connectToRabbit(process.env.RABBITMQ_HOST, process.env.RABBITMQ_PASS);

//dequeue responses
rabbitConnectPromise.then((r)=>{
    var [conn, ch] = r;
     ch.consume('aituning', (msg)=>{
        data = JSON.parse(msg.content.toString());
        //{"ais":[{"aiRatioOfBoard":0.015,"team":1,"host":"localhost:8747","serverAddress":"b2f21285-b272-4c6e-92d3-19d18d95d766","boardRatio":0.19298245614035087},{"aiRatioOfBoard":0.5,"team":2,"host":"localhost:8747","serverAddress":"b2f21285-b272-4c6e-92d3-19d18d95d766","boardRatio":0.8070175438596491}]}
        var ai = data.ais[0];
        genetic.fitnessData[ai.id] = genetic.fitnessData[ai.id] || [];
        genetic.fitnessData[ai.id].push(ai.boardRatio);
        ai = data.ais[1];
        genetic.fitnessData[ai.id] = genetic.fitnessData[ai.id] || [];
        genetic.fitnessData[ai.id].push(ai.boardRatio);
        ch.ack(msg); //ack the message as success
     });
})

genetic.evolve({size:50, iterations:100, fittestAlwaysSurvives:true})
