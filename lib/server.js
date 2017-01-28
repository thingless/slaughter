function guid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {var r = Math.random()*16|0,v=c=='x'?r:r&0x3|0x8;return v.toString(16);});
}

function serverMain() {
    var WebSocketServer = require("ws").Server;
    var http = require("http");
    var express = require('express');
    var url = require('url');
    var bodyParser = require('body-parser');
    var fs = require('fs');

    var port = process.env.PORT || 8080;

    var dir = __dirname + '/../src';

    var app = express();
    app.use(express.static(dir, { maxAge: 5000 }));
    app.use(bodyParser.json({limit: '50mb'})); // for parsing application/json
    app.post('/filesave', function (req, res) {
        fs.writeFile(guid()+".json", JSON.stringify(req.body), function(err){
            if(err) console.log(err);
            res.json({success:!err})
        })
    })
    var server = http.createServer(app);
    server.listen(port,(err)=>{
        if(err){
            console.error(err);
            process.exit(1);
        }
        console.log("http server listening on %d", port);
        console.log("Serving files from", dir);
    });

    var websocketMap = {};

    var wss = new WebSocketServer({server: server});
    wss.on("connection", function (ws) {
        var href = url.parse(ws.upgradeReq.url, true);

        var userId = guid();
        websocketMap[userId] = ws;

        console.log("websocket connection open at", href.path, "for new user", userId);

        ws.on("message", function (data, flags) {
            try {
                var msg = JSON.parse(data);
            } catch(e) {
                console.log("websocket user", userId, "sent us invalid message", msg);
                return;
            }

            console.log("websocket user", userId, "sent us a msg");

            if (msg.method === "simonWhatsMyAddress") {
                ws.send(JSON.stringify({"to": userId, "method": "simonSaysSetYourAddress"}));
                return;
            }

            // Ensure the "from" matches their user id
            if(msg['from'] !== userId) {
                console.log("message was not from", userId);
                return;
            }

            // If the "to" user is known to us, send the message along to them
            var toWs = websocketMap[msg['to']];
            if (toWs === undefined) {
                console.log("message from", userId, "to", msg['to'], "failed because we don't know that user");
                return;
            }

            // Send the message along to that user
            toWs.send(JSON.stringify(msg));
        });

        ws.on("close", function () {
            websocketMap[userId] = undefined;
            console.log("websocket connection closed for user", userId);
        });
    });
}

serverMain();
