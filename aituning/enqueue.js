#!/usr/bin/env node

var amqp = require('amqplib/callback_api');
//var _ = require('underscore');

if(process.argv.length <= 2){
    console.error(`usage: size=16 host=localhost:8080 node ./src/enqueue.js '{"ais":[{},{}]}'`)
    process.exit(1);
}

var url = `amqp://admin:${process.env.RABBITMQ_PASS||'admin'}@${process.env.RABBITMQ_HOST||'localhost'}:5672/vhost`;
var numberOfConsumers = parseInt(process.env.CONSUMERS||2);
console.log('connecting to ' + url);
amqp.connect(url, function(err, conn) {
  if(err){
      console.error(err);
      process.exit(1);
  }
  conn.createChannel(function(err, ch) {
    ch.assertQueue('aituning', {durable: false});
    console.log('enqueuing')
    ch.sendToQueue('aituning', Buffer.from(JSON.stringify(JSON.parse(process.argv[2]))));
    console.log('enqueued');
    setTimeout(function() { conn.close(); process.exit(0) }, 100);
  });
});
