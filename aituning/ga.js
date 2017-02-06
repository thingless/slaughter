var Genetic = require('genetic-js');
var _ = require('lodash');
var amqp = require('amqplib/callback_api');
var AMQPStats = require('amqp-stats');
var sleep = require('sleep').sleep; //in seconds
var waitUntillQueueEmpty = require('./compare').waitUntillQueueEmpty;
var guid = require('./compare').guid;
var connectToRabbit = require('./compare').connectToRabbit;
var moniker = require('moniker');

function lerp(a, b, p) {
    return a + (b-a)*p;
}

function nameAi(vector){
    return _.extend({},vector,{
        id:guid(),
        name:moniker.choose()
    })
}

function normalizeParamsVector(vector){
    var total = 0;
    _.mapValues(vector, (val, key)=>{
        if (_.isNumber(val)) total += val;
    });
    vector = _.mapValues(vector, (val, key)=>{
        if(!_.isNumber(val)) return val;
        return val/total;
    })
    return vector;
}

function selectRandomKey(entity) {
    var keys = _.keys(entity);
    return keys[_.random(0, keys.length-1)];
}

function enqueuNextGeneration(entities, generationId) {
    //first create random games
    var tmp = _(_.range(40))
        .map(()=>entities)
        .flatten()
        .shuffle()
        .value();
    var games = [];
    while(tmp.length > 1){
        games.push(tmp.splice(0,2));
    }
    games = games.map((g)=>JSON.stringify({generationId:generationId, ais:g}))
    //next enqueue the games
    return rabbitConnectPromise.then((r)=>{
        var [conn, ch] = r;
        console.log("enqueueing "+games.length+" games for "+entities.length+" entities");
        games.forEach((game)=>{
            ch.sendToQueue('aituning', Buffer.from(game));
        })
    })
}

function sleepPromise(milliseconds) {
    return new Promise((resolve,reject)=>setTimeout(resolve, milliseconds||0))
}

function doNextGeneration(entities, generationId){
    return enqueuNextGeneration(entities, generationId)
        .then(()=>sleepPromise(5000)) //sleep so the queue will not immediately be empty
        .then(()=>waitUntillQueueEmpty(process.env.RABBITMQ_STATS_HOST, process.env.RABBITMQ_PASS, 5))
}

var genetic = Genetic.create();
genetic.fitnessData = {}
genetic.generationNumber = 0;
genetic.optimize = Genetic.Optimize.Maximize;
genetic.select1 = Genetic.Select1.Tournament3;
genetic.select2 = Genetic.Select2.Tournament3;
genetic.seed = function(){
    return nameAi(normalizeParamsVector({
        aiRatioOfBoard:Math.random(),
        aiRatioOfHexesAffordable:Math.random(),
        aiRatioOfDefendedHexes:Math.random(),
        aiRatioOfProfitableHexes:Math.random(),
        aiRatioOfBorderHexes:Math.random(),
        aiRatioOfDefendedBorderHexes:Math.random(),
    }));
}
genetic.mutate = function(entity) {
    entity = _.extend({}, entity);
    key = selectRandomKey(entity);
    entity[key] += Math.random()-0.5;
    var ret = nameAi(normalizeParamsVector(entity));
    console.log("mutate before", entity, "after", ret);
    return ret;
}
genetic.crossover = function(mother, father) {
    var son = _.extend({}, father);
    var key = selectRandomKey(mother);
    son[key] = mother[key]
    var daughter = _.extend({}, mother);
    key = selectRandomKey(father);
    daughter[key] = father[key];
    var ret = [
        nameAi(son),
        nameAi(daughter)
    ];
    console.log("mother",mother,"father",father,"son",ret[0],"daughter",ret[1]);
    return _.map(ret, normalizeParamsVector);
}
genetic.fitness = function(entity){
    genetic.doNextGeneration = genetic.doNextGeneration || doNextGeneration(this.entities, this.generationNumber)
    return genetic.doNextGeneration.then(()=>{
        var fitness = genetic.fitnessData[entity.id]
        if(!fitness) return 0; //no data is a 0
        return _.reduce(fitness, (memo, num)=>memo+num, 0) / fitness.length;
    });
}
genetic.generation = function(pop, generation, stats){
    genetic.fitnessData = {};
    genetic.doNextGeneration = null;
    genetic.generationNumber = generation;
    return true;
}
genetic.notification = function(pop, generation, stats, isFinished){
    console.log("Finished generation #", generation)
    console.log("Stats: "+JSON.stringify(stats))
    console.log("High Scores:")
    pop.slice(0, 5).forEach((entity)=>{
        console.log(entity.fitness, entity);
    })
    console.log("Population:");
    console.log(JSON.stringify(pop))
}

var rabbitConnectPromise = connectToRabbit(process.env.RABBITMQ_HOST, process.env.RABBITMQ_PASS);

function dequeueResponses() {
    rabbitConnectPromise.then((r)=>{
        var [conn, ch] = r;
        ch.consume('aituningRes', (msg)=>{
            data = JSON.parse(msg.content.toString());
            console.log("Response: " + msg.content.toString())
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
}

if (require.main === module) {
    dequeueResponses();
    genetic.evolve({size:50, iterations:100, fittestAlwaysSurvives:true});
}
