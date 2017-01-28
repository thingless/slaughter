#!/usr/bin/env node

var amqp = require('amqplib/callback_api');
var spawn = require('child_process').spawn;
var _ = require('underscore');

function consumeMsg(msg) {
    //msg has format { ais:[{},{},...], env:{host:"",...} }
    return new Promise((resolve, reject)=>{
        var env = _.extend({}, process.env, msg.env);
        var child = spawn(process.execPath, ['./src/aiplayoff.js', JSON.stringify(msg)], env);
        var res = [];
        child.stdout.on('data', (s)=>{
            console.log((""+s).trim());
            res.push(""+s);
        });
        child.stderr.on('data', (s)=>console.warn((""+s).trim()));
        child.on('exit', function (code) {
            console.log('ai process exited with code ' + code);
            if(code===0){
                resolve(JSON.parse(res.join("")));
            } else {
                reject({error:"Exit code no zero", code:code});
            }
        });
    })
}

var url = `amqp://admin:${process.env.RABBITMQ_PASS||'admin'}@${process.env.RABBITMQ_HOST||'localhost:5672'}/vhost`;
var numberOfConsumers = parseInt(process.env.CONSUMERS||1);
console.log('connecting to ' + url);
amqp.connect(url, function(err, conn) {
  console.log('connected')
  if(err){
      console.error(err);
      process.exit(1);
  }
  conn.createChannel(function(err, ch) {
    console.log('created channel');
    ch.assertQueue('aituning', {durable: false});
    ch.assertQueue('aituningRes', {durable: false});
    console.log('asserted queues aituning & aituningRes');
    console.log(`Spinning up ${numberOfConsumers} consumers...`);
    for (var i = 0; i < numberOfConsumers; i++) {
        ch.consume('aituning', (msg)=>{
            consumeMsg(JSON.parse(msg.content.toString()))
                .then((res)=>{
                    ch.sendToQueue('aituningRes', Buffer.from(JSON.stringify(res)));
                    ch.ack(msg) //ack the message as success
                })
                .catch((err)=>
                    ch.nack(msg, false, false) //failed to process message... nack & dead letter
                )
        });
    }
    console.log(`${numberOfConsumers} consumers started`)
  });
});