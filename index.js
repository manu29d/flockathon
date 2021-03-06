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

// Read tokens from a local file, if possible.
var tokens;
try {
    tokens = require('./tokens.json');
} catch (e) {
    tokens = {};
}

function callCustomSearch(messages, event, res) {
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
        items: JSON.parse(body).items,
        sendTo: event.chat,
        userId: event.userId,
        imageOnly: event.imageOnly,
        textOnly: event.textOnly
      });
    } else {
      console.log(error);
    }
  });
}

app.get('/actions', function (req, res, next) {
  var event = JSON.parse(req.query.flockEvent);
  console.log(event);
  event.textOnly = false; event.imageOnly = false;
  if (event.name === 'client.slashCommand') {
    var args = event.text.split(/\s/);
    if (args[0] === '-i') {event.imageOnly = true; event.text = args.slice(1).join(' ')}
    else if (args[0] === '-t') {event.textOnly = true; event.text = args.slice(1).join(' ')}
    callCustomSearch([{text: event.text}], event, res);
  }
  else {
    flock.callMethod('chat.fetchMessages', tokens[event.userId], {
      chat: event.chat,
      uids: event.messageUids
    }, function (err, messages) {
      if (err) { return console.log(err) }
      else {
        callCustomSearch(messages, event, res);
      }
    });
  }
});

app.get('/sendMessage', function (req, res) {
  console.log('/sendMessage', req.query);
  var attachObj = {
    "title" : req.query.title ,"description": req.query.description ,
    "views": {
      "image": {
        "original": { "src": req.query.image , "width": 250, "height": 250 },
        "filename": "filename.jpg"
      }
    }
  };
  if (req.query.imageOnly) {
    delete attachObj.title;
    delete attachObj.description;
    req.query.text = '';
  } else if (req.query.textOnly) {
    delete attachObj.views;
  }
  flock.callMethod('chat.sendMessage', tokens[req.query.userId], {
    to:  req.query.sendTo,
    text: req.query.text,
    attachments: [attachObj]
  }, function (error, response) {
    if (!error) {
      console.log(response);
      res.sendStatus(200);
    } else { console.log(error); }
  });
});

// save tokens on app.install
flock.events.on('app.install', function (event) {
    tokens[event.userId] = event.token;
});

// delete tokens on app.uninstall
flock.events.on('app.uninstall', function (event) {
    delete tokens[event.userId];
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
