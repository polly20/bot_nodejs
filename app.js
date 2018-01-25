var express = require('express');
var bodyParser =  require('body-parser');
var request = require('request');
var cache = require('memory-cache');
var app = express();
app.use(bodyParser.urlencoded({"extended": false}));
app.use(bodyParser.json());
var settings = require('./settings.js');

const PAGE_ACCESS_TOKEN = settings.PAGE_ACCESS_TOKEN; //"EAAYYmSZAZBhIkBACqwsWHRjX7P9ko35EPBZBiTnZAD2DlSBuZCtJJZByDHx1ZCMsyLFSEbocLP2ZCKQXZBVbOOphlmp8Hiv8RRounnGiVrAMcY6fvBhORI7H2HERJbeI31aTQ4KtSSioId02egzM5QSJOQ8nVXzHxCLxElpv1EU4oJwSMQDLAqUyA";
const VERIFY_TOKEN = settings.VERIFY_TOKEN; //"PAOPAO2121";
const API_URL = settings.API_URL; //"http://home.kpa.ph:5000";
var newCache;

// Test
app.get('/test', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  console.log(settings);
  res.json(settings);
});

// Test
app.get('/mpin', (req, res) => {
  var cache_mpin = newCache.get('MPIN');
  var users_mpin = req.query["pin"]
  console.log("mem_cache: " + cache_mpin);
  console.log("user_pin: " + users_mpin);
  res.setHeader("Content-Type", "text/html");
  if(parseInt(cache_mpin) == parseInt(users_mpin)) {
    res.send("nice");
  }
  res.send("nope");
});

// To verify
app.get('/webhook', (req, res) => {
  if(req.query['hub.verify_token'] === VERIFY_TOKEN) {
    res.send(req.query['hub.challenge']);
  }
  res.send('Error, wrong validation token');
});

app.post('/webhook', (req, res) => {

  // Parse the request body from the POST
  let body = req.body;

  // Check the webhook event is from a Page subscription
  if (body.object === 'page') {

    // Iterate over each entry - there may be multiple if batched
    body.entry.forEach(function(entry) {

      // Gets the body of the webhook event
      let webhook_event = entry.messaging[0];
      console.log(webhook_event);

      // Get the sender PSID
      let sender_psid = webhook_event.sender.id;
      console.log('Sender PSID: ' + sender_psid);

      // Check if the event is a message or postback and
      // pass the event to the appropriate handler function
      if (webhook_event.message) {
        handleMessage(sender_psid, webhook_event.message);
      } else if (webhook_event.postback) {
        handlePostback(sender_psid, webhook_event.postback);
      }

    });

    // Return a '200 OK' response to all events
    res.status(200).send('EVENT_RECEIVED');

  } else {
    // Return a '404 Not Found' if event is not from a page subscription
    res.sendStatus(404);
  }

});

function handleMessage(sender_psid, received_message) {
  let response;
  // Check if the message contains text
  if (received_message.text) {
    // Create the payload for a basic text message
    var data;
    var msg = received_message.text;

    if(msg.includes("LC")) {
      data = msg.split(" ");
      console.log(data);
      if(data.length > 1) {
        callSendPtxt4wrdAPI(sender_psid, data[1], data[2]);
      }
    }

    else if(msg.includes("MPIN")) {
      data = msg.split(" ");
      console.log(data);
      if(data.length > 0) {
        mpinVerify(sender_psid, data[1]);
      }
    }

    else if(msg.includes("PTXT")) {
      data = msg.split(" ");
      console.log(data);
      if(data.length > 0) {
        callPTXT4wrdSMSAPI(sender_psid, data[1], data[2]);
      }
    }

    else {
      handleMessageSend(sender_psid, msg);
    }
  }
}

function handleMessageSend(sender_psid, received_message) {
  let response;
  // Create the payload for a basic text message
  response = {
    "text": `${received_message}`
  }
  // Sends the response message
  callSendAPI(sender_psid, response);
}

function handlePostback(sender_psid, received_postback) {
  let response;

  // Get the payload for the postback
  let payload = received_postback.payload;

  // Set the response based on the postback payload
  if (payload === 'yes') {
    response = { "text": "Thanks!" }
  } else if (payload === 'no') {
    response = { "text": "Oops, try sending another image." }
  }
  // Send the message to acknowledge the postback
  callSendAPI(sender_psid, response);
}

function callSendAPI(sender_psid, response) {
  // Construct the message body
  let request_body = {
    "recipient": {
      "id": sender_psid
    },
    "message": response
  }

  // Send the HTTP request to the Messenger Platform
  request({
    "uri": "https://graph.facebook.com/v2.6/me/messages",
    "qs": { "access_token": PAGE_ACCESS_TOKEN },
    "method": "POST",
    "json": request_body
  }, (err, res, body) => {
    if (!err) {
      console.log('message sent!')
    } else {
      console.error("Unable to send message:" + err);
    }
  });
}


// ptxt4wrd 

function callSendPtxt4wrdAPI(sender_psid, mobile, command) {
  // Construct the message body

  let request_body = {
    "mobile": mobile,
    "command": command.replace("-", " ")
  }

  newCache = new cache.Cache();
  var stringMSG = null;
  // Send the HTTP request to the Messenger Platform
  request({
    "uri": API_URL + "/command/execute/v2",
    "method": "GET",
    "json": request_body
  }, (err, res, body) => {
    if (!err) {
      console.log(body);
      var mpin_verify = body['MPIN'];
      newCache.put('MPIN', mpin_verify);
      newCache.put('MOBILE', mobile);
      newCache.put('COMMAND', command);

      var summary = "We have sent MPIN to this mobile " + body['Mobile'] + ", Your command is " + body['Command'] + ".\r\nPlease type MPIN<space>6 digits then hit enter";

      console.log(summary);
      console.log(newCache.get('MPIN'));
      console.log(sender_psid);
      handleMessageSend(sender_psid, summary);
    } 
    else {
      console.error("Unable to send message:" + err);
      stringMSG = "Unable to send message:" + err;
      handleMessageSend(sender_psid, stringMSG);
    }
  });

  return stringMSG;
}

function callSendLoad4wrdAPI(sender_psid, mobile, command) {
  // Construct the message body

  let request_body = {
    "mobile": mobile,
    "command": command.replace("-", " ")
  }

  newCache = new cache.Cache();
  var stringMSG = null;
  // Send the HTTP request to the Messenger Platform
  request({
    "uri": API_URL + "/command/process/v2",
    "method": "GET",
    "json": request_body
  }, (err, res, body) => {
    if (!err) {
      var status = parseInt(body['Status']);
      var msg = "Something went wrong, please try again.";
      if(status == 200) {
        msg = "Your request is being processed.";
      }
      console.error(msg);
      handleMessageSend(sender_psid, msg);
    } 
    else {
      console.error("Unable to send message:" + err);
      stringMSG = "Unable to send message:" + err;

      handleMessageSend(sender_psid, stringMSG);
    }
  });

  return stringMSG;
}

function mpinVerify(sender_psid, users_mpin) {
  var cache_mpin = 0;
  try{
    cache_mpin = newCache.get('MPIN');
    cache_mobile = newCache.get('MOBILE');
    cache_command = newCache.get('COMMAND');

    if(parseInt(cache_mpin) == parseInt(users_mpin)) {
      callSendLoad4wrdAPI(sender_psid, cache_mobile, cache_command);
    }
    else {
      handleMessageSend(sender_psid, "Invalid MPIN");
    }

  } catch( err ){
    handleMessageSend(sender_psid, "No MPIN set.");
  }
  console.log("mem_cache: " + cache_mpin);
  console.log("user_pin: " + users_mpin);
}

function callPTXT4wrdSMSAPI(sender_psid, mobile, message) {
  // Construct the message body

  let request_body = {
    "mobile": mobile,
    "message": message
  }

  newCache = new cache.Cache();
  var stringMSG = null;
  // Send the HTTP request to the Messenger Platform
  request({
    "uri": API_URL + "/command/ptxt",
    "method": "GET",
    "json": request_body
  }, (err, res, body) => {
    if (!err) {
      var status = parseInt(body['Status']);
      var msg = "Something went wrong, please try again.";
      if(status == 200) {
        msg = "Your message is being sent.";
      }
      if(status == 201) {
        msg = "Your message is being sent.";
      }
      console.error(msg);
      handleMessageSend(sender_psid, msg);
    } 
    else {
      console.error("Unable to send message:" + err);
      stringMSG = "Unable to send message:" + err;
      handleMessageSend(sender_psid, stringMSG);
    }
  });

  return stringMSG;
}

// app.listen(3200);

app.listen(process.env.PORT);
