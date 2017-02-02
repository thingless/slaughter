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
        hostname: statsHost||'localhost:15672'//process.env.RABBITMQ_STATS_HOST||'localhost:15672'
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
    });
}
module.exports.waitUntillQueueEmpty = waitUntillQueueEmpty;

function guid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {var r = Math.random()*16|0,v=c=='x'?r:r&0x3|0x8;return v.toString(16);});
}
module.exports.guid = guid;

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
module.exports.connectToRabbit = connectToRabbit;

function main(ais){
    var fitnessData = [];
    connectToRabbit(process.env.RABBITMQ_HOST, process.env.RABBITMQ_PASS)
        .then((r)=>{
            var [conn, ch] = r;
            //listen for finished jobs
            ch.consume('aituningRes', (msg)=>{
                process.stdout.write('-');
                data = JSON.parse(msg.content.toString());
                fitnessData.push(data.ais[0].boardRatio);
                ch.ack(msg); //ack the message as success
            });
            //queue the jobs
            console.log('enqueueing jobs');
            for (i = 0; i < (process.env.TRIALS||50); i++) {
                ch.sendToQueue('aituning', Buffer.from(JSON.stringify(ais)));
                process.stdout.write('+');
            }
            return new Promise((resolve)=>setTimeout(resolve,5000))
        })
        .then(()=>waitUntillQueueEmpty(process.env.RABBITMQ_STATS_HOST, process.env.RABBITMQ_PASS))
        .then(()=>{
            console.log("Fitness data:");
            console.log(JSON.stringify(fitnessData));
            var avg = fitnessData.reduce((total,d)=>total+d,0);
            console.log("Average: "+(avg/fitnessData.length));
            process.exit(0);
        })
}

if (require.main === module) {
    if(!process.argv[2]){
        console.error(`Usage: TRIALS=50 node ./compare.js '{"ais":[{"aiRatioOfBoard":0.1},{"aiRatioOfBoard":0.5}]}'`);
        process.exit(1);
    }
    main(JSON.parse(process.argv[2]))
}