#!/usr/bin/env node

var amqp = require('amqplib/callback_api');

function consumeMsg(msg) {
    //msg has format {ai1:{envVars}, ai2:{envVars}}
}

var url = `amqp://user:${process.env.PASS||'user'}@${process.env.HOST||'localhost'}`;
var numberOfConsumers = parseInt(process.env.CONSUMERS||2);
console.log('connecting to ' + url);
amqp.connect(url, function(err, conn) {
  conn.createChannel(function(err, ch) {
    ch.assertQueue('aituning', {durable: false});
    ch.assertQueue('aituningRes', {durable: false});
    console.log(`Spinning up ${numberOfConsumers} consumers...`);
    for (var i = 0; i < numberOfConsumers; i++) {
        ch.consume(q, (msg)=>{
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