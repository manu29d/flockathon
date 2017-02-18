var flock = require('flockos');
var config = require('./config.js');
var express = require('express');
var fs = require('fs');
var request = require('request');
var ejs = require('ejs');

flock.setAppId(config.appId);
flock.setAppSecret(config.appSecret);

var app = express();

// Listen for events on /events, and verify event tokens using the token verifier.
app.use(flock.events.tokenVerifier);
app.set('view engine', 'ejs');

app.post('/events', flock.events.listener);
app.get('/actions', function (req, res, next) {
  var event = JSON.parse(req.query.flockEvent);
  flock.callMethod('chat.fetchMessages', tokens[event.userId], {
    chat: event.chat,
    uids: [event.messageUids.messageUid]
  }, function (err, messages) {
    if (err) { return console.log(err) }
    else {
      request({
        uri: 'https://www.googleapis.com/customsearch/v1',
        qs: {
          key: config.google.key,
          cx: config.google.cx,
          q: messages[0].text
        }
      }, function (error, response, body) {
        if (!error && response.statusCode === 200) {
          res.render('actions', {
            items: JSON.parse(body).items
          });
        } else {
          console.log(error);
        }
      });
    }
  });
});
app.post('/sendMessage', function (req) {
flock.callMethod('chat.sendMessage', token, {
    to:  req.body.sendto ,
    text: req.body.text
}, function (error, response) {
    if (!error) {
        console.log(response);
    }
});
});

// Read tokens from a local file, if possible.
var tokens;
try {
    tokens = require('./tokens.json');
} catch (e) {
    tokens = {};
}

// save tokens on app.install
flock.events.on('app.install', function (event) {
    tokens[event.userId] = event.token;
});

// delete tokens on app.uninstall
flock.events.on('app.uninstall', function (event) {
    delete tokens[event.userId];
});

flock.events.on('client.messageAction', function (event) {
});



// Start the listener after reading the port from config
var port = config.port || 9000;
app.listen(port, function () {
    console.log('Listening on port: ' + port);
});

// exit handling -- save tokens in token.js before leaving
process.on('SIGINT', process.exit);
process.on('SIGTERM', process.exit);
process.on('exit', function () {
    fs.writeFileSync('./tokens.json', JSON.stringify(tokens));
});
