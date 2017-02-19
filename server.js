var express  = require('express');
var app      = express();// create our app w/ express

var path =  require("path");
var morgan = require('morgan');             // log requests to the console (express4)
var methodOverride = require('method-override'); // simulate DELETE and PUT (express4)

var Mopidy = require("mopidy");
var bodyParser = require('body-parser');

const session = require('express-session')

var app = express();
var passport = require('passport')
    , LocalStrategy = require('passport-local').Strategy;

app.use(bodyParser.json()); // support json encoded bodies
app.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies
app.use(passport.initialize());
app.use(passport.session());

app.use(express.static(__dirname + '/public'));                 // set the static files location /public/img will be /img for users

app.use('/scripts/ui-bootstrap', express.static(__dirname + '/node_modules/angular-ui-bootstrap/dist/'));
app.use('/scripts/angular-animate', express.static(__dirname + '/node_modules/angular-animate/'));
app.use('/scripts/angular-route', express.static(__dirname + '/node_modules/angular-route/'));
app.use('/scripts/bootstrap/', express.static(__dirname + '/node_modules/bootstrap/dist/'));
app.use('/scripts/angular/', express.static(__dirname + '/node_modules/angular/'));


app.use(morgan('dev'));                                         // log every request to the console
app.use(bodyParser.urlencoded({'extended':'true'}));            // parse application/x-www-form-urlencoded
app.use(bodyParser.json());                                     // parse application/json
app.use(bodyParser.json({ type: 'application/vnd.api+json' })); // parse application/vnd.api+json as json
app.use(methodOverride());

passport.serializeUser(function(user, done) {
    done(null, user.username);
});

passport.deserializeUser(function(username, done) {
    var user = party.guests.filter(function(guest){
        return guest.username == username;
    })[0];
    done(null, user);
});

passport.use(new LocalStrategy(
    function(username, password, done) {
        if(!party){
            return done(null, false);
        }
        var user = party.guests.filter(function(guest){
            return guest.username == username;
        })[0];
        if(!user){
            console.log(username, "is not a member of the party.")
            return done(null, false);
        }else if(user.password == password){
            console.log(user.username,"successfully authenticated.");
            return done(null, user);
        }else{
            console.log(user.username,"failed to authenticate.")
            return done(null, false);
        }
    }
));

var mopidy = new Mopidy({
    webSocketUrl: "ws://localhost:6680/mopidy/ws/"
});

var party;
var rootPath = "/api/v1";
/* Guest Login */
app.post(rootPath+'/login', function (req, res) {
    if(!party){
        res.status(404).send({errorCode:404, message:"There is no party to join"});
        return;
    }else if(party.guests.filter(function(guest){return guest.username == req.body.username;})[0]){
        res.status(403).send({errorCode:403, message:"User is already logged in."});
        return;
    }else{

        var guest = {username:req.body.username, password:req.body.password};
        party.guests.push(guest);
        var currentState = {guests:party.guests.map(function(user){return {username:user.username}})};


        var printCurrentTrack = function (track) {
            currentState.hostsName = party.hostsName;
            if (track) {
                currentState.currentTrack = track;
                console.log("Currently playing:", track.name, "by", track.artists[0].name, "from", track.album.name);

            } else {
                console.log("No current track");
            }
            res.send(JSON.stringify(currentState));
        };
        if(mopidy.playback){
            mopidy.playback.getCurrentTrack().done(printCurrentTrack);
        }
    }
});

app.post(rootPath+'/party/skiptrackvote', passport.authenticate('local', { session: false }), function(req, res){
    var voteBy = req.body.username;
    var guest = party.guests.filter(function(guest){
        return guest.username == voteBy;
    });
    if(guest.length == 0){
        res.status(401).send({errorCode:401, message:"You are not part fo this party and need to join before you can vote to skip tracks."});
        return;
    }
    if(party.votesToSkipCurrentTrack.indexOf(voteBy) != -1){
        res.status(403).send({errorCode:403, message:"You have already voted to skip this track, you cannot vote more than once."});
        return;
    }else {
        party.votesToSkipCurrentTrack.push(voteBy);
        if(party.votesToSkipCurrentTrack.length >= 3){
            console.log("Skipping track due to enough votes.", party.votesToSkipCurrentTrack, "voted to skip.");
            mopidy.playback.next();
            party.votesToSkipCurrentTrack = [];
        }
        res.send({status:"OK"});
    }
});

app.post(rootPath+'/party/queue/track', passport.authenticate('local', { session: false }), function (req, res){
    if(!party){
        res.status(403).send({errorCode:403, message:"There is no party"});
        return;
    }
    if(!mopidy.tracklist){
        res.status(500).send({errorCode:500, message:"Internal Server Error"});
        return;
    }
    var play = {"tracks":null,"at_position":null,"uri":req.body.uri,"uris":null};
    mopidy.tracklist.add(null, null, req.body.uri).then(function(data){
        console.log(data);
    }).then(function (){
        mopidy.playback.getState().then(function(data){
            if(data == "stopped"){
                mopidy.playback.play();
            }
        });
    });
    res.send({status:"OK"});

});

app.get(rootPath+'/party', function (req, res){
    if(!party){
        res.status(404).send({errorCode:404, message:"There is no current party."});
    }else{
        var currentState = {};
        currentState.hostsName = party.hostsName;
        currentState.guests = party.guests.map(function(guest){ return {username:guest.username} });

        mopidy.tracklist.setConsume(true); //remove tracks once played

        if(mopidy.playback){
            mopidy.playback.getCurrentTrack().then(function(track){
                if (track) {
                    currentState.currentTrack = track;
                    console.log("Currently playing:", track.name, "by", track.artists[0].name, "from", track.album.name);
                } else {
                    console.log("No current track");
                }
            }).then(function(){
                return mopidy.tracklist.getTlTracks();
            }).then(function(tracklist){
                currentState.tracklist = tracklist;
            }).then(function(){
                res.send(JSON.stringify(currentState));
            });
        }else{
            res.send(JSON.stringify(currentState));
        }
    }
});

app.get(rootPath+'/media', function(req, res){
    var q = req.query.q.split(":");
    var field = q[0];
    var query = q[1];
    var searchQuery = {};
    searchQuery[field] = query;
    mopidy.library.search(searchQuery).then(function(results){
        var totalTracks = results[0].tracks ? results[0].tracks.length : 0;
        var totalArtists = results[0].artists ? results[0].artists.length : 0;
        var totalAlbums = results[0].albums ? results[0].albums.length : 0;
        console.log("tracks:", totalTracks, ", artists:", totalArtists, ", albums:", totalAlbums);
        res.send(JSON.stringify(results));
    });
});

/* Create a new party */
app.post(rootPath+'/party', function (req, res) {

    if(party){
        res.status(403).send({errorCode:403, message:"There is already a party in progress, you cannot create a new one until that one is finished!"})
    }else{
        party = {};
        party.hostsName = req.body.username;
        party.password = req.body.password;
        party.guests = [];
        party.votesToSkipCurrentTrack = [];
        console.log("New party hosted by", party.hostsName);
        res.send(JSON.stringify(party));
    }

});

app.get('*', function (req, res) {
    res.sendFile(path.join(__dirname, '/public', 'index.html'));
});

app.listen(3000, function () {
    console.log('Example app listening on port 3000!')
});