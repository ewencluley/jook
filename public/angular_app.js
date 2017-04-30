var jookApp = angular.module('jookApp', ['ngRoute', 'ui.bootstrap', 'ngCookies']);
jookApp.config(['$locationProvider', function ($locationProvider) {
    $locationProvider.hashPrefix('');
}]);
jookApp.run(['$rootScope', '$location', function ($root, $location) {
    $root.$on('$routeChangeStart', function (e, curr, prev) {
        if (curr.$$route && curr.$$route.resolve) {
            // Show a loading message until promises aren't resolved
            $root.loadingView = true;
        }
    });
    $root.$on('$routeChangeSuccess', function (e, curr, prev) {
        // Hide loading message
        $root.loadingView = false;
    });
}]);

jookApp.config(function ($routeProvider) {
    $routeProvider
        .when('/search', {
            templateUrl: 'pages/search.html',
            controller: 'SearchController'
        })
        .when('/browse/:uri', {
            templateUrl: 'pages/browse.html',
            controller: 'BrowseController'
        })

     .otherwise({ redirectTo: '/search' });
});

jookApp.controller('PartyController', function PartyController($scope, $http, $httpParamSerializerJQLike, $rootScope, $location, $cookies, $anchorScroll) {
    var connection = new WebSocket("ws://" + window.location.hostname + ":8001");

    $scope.$on("Login", function(event, args){

    });

    $scope.playing = {};
    $scope.browse = {};
    $scope.browse.stack = [];
    var mopidy = new Mopidy({
        webSocketUrl: "ws://jook.local:6680/mopidy/ws/",
        callingConvention: "by-position-or-by-name"
    });
    mopidy.connect();
    var username, userguid;
    do{
        $scope.username = $cookies.get("jookUserName");
        $scope.userguid = $cookies.get("jookUserGuid");
        if(!$scope.userguid){
            $scope.userguid = generateUUID();
            $cookies.put("jookUserGuid", $scope.userguid);
        }
        if(!$scope.username || $scope.username == ""){
            $scope.username = prompt("Enter your name");
            $cookies.put("jookUserName", $scope.username);
        }
    }while(!$scope.username || $scope.username == "");
    connection.onopen = function(event){
        var loginObject = {command:"login", username: $scope.username, userguid: $scope.userguid};
        console.log("User logging in with details:", loginObject);
        connection.send(JSON.stringify(loginObject));
    }
    connection.onmessage = function (event) {
        var newPartyState = JSON.parse(event.data);
        console.log(newPartyState);
        $scope.party = newPartyState;
        if($scope.search && $scope.search.results && $scope.party.tracklist){
            $scope.search.playing = findPlaying($scope.search.results, $scope.party.tracklist);
        }
        if($scope.browse && $scope.browse.results && $scope.party.tracklist){
            $scope.browse.playing = findPlaying($scope.browse.results, $scope.party.tracklist);
        }
        $scope.$apply();
    }
    //$scope.party = party;
    // $scope.partysettings = JSON.parse(JSON.stringify(party));
    $scope.userUUID = $cookies.get('userUUID');
    $scope.updateParty = function () {
        $scope.callPartyService('PUT');
    };
    $scope.createParty = function () {
        $scope.callPartyService('POST');
    };
    $scope.callPartyService = function (method) {
        $http({
            method: method,
            url: '/api/v1/party',
            data: $httpParamSerializerJQLike({
                username: $scope.partysettings.host.username,
                password: $scope.deviceFingerprint
            }),  // pass in data as strings
            headers: {'Content-Type': 'application/x-www-form-urlencoded'}  // set the headers so angular passing info as form data (not request payload)
        }).then(function (response) {
            $cookies.put('userUUID', response.data.password);
            $cookies.put('username', response.data.username);
            $rootScope.$broadcast("alert", {status: response.status, message: "Party started, now queue some tunes!"});
            $rootScope.party = response.data;
            $location.path("search");
        }, function myError(response) {
            $rootScope.$broadcast("alert", {status: response.status, message: response.data.message});
        });
    }
    $scope.voteToSkip = function(){
        var voteToSkip = {command: "voteToSkip", uri: $scope.party.currentTrack.uri}
        connection.send(JSON.stringify(voteToSkip));
        console.log(($scope.party.votesToSkipCurrentTrack.length/$scope.party.guests.length)*100 / $scope.party.config.votesToSkip.value);
    };

    $scope.$on("voteToPlayNext", function(event, uri){
        var voteToPlayNext = {command: "voteToPlayNext", uri: uri}
        connection.send(JSON.stringify(voteToPlayNext));
    });

    $scope.$on("playTrack", function (event, args) {
        var playCommand = {command:"play", uri: args};
        connection.send(JSON.stringify(playCommand));
    });
    $scope.search = {inprogress: false};

    $scope.$on("search", function (event, query) {
        $scope.search.inprogress = true;
        $http.get("/api/v1/media?q=" + query)
            .then(function (response) {
                $scope.search.results = response.data[0];
                $scope.search.inprogress = false;
                if($scope.search && $scope.search.results && $scope.party.tracklist){
                    $scope.search.playing = findPlaying($scope.search.results, $scope.party.tracklist);
                }
                var albumsAndArtists = $scope.search.results.albums.concat($scope.search.results.artists).map(function(element){
                    return element.uri;
                });
                mopidy.library.getImages({"uris":albumsAndArtists}).then(function(data){
                    $scope.search.results.images = data;
                    console.log(data);
                    $scope.$apply();
                });
            });
    })

    $scope.browseBack = function(){
        $scope.browse.stack.pop();
        if($scope.browse.stack.length == 0){
            $location.url("/search/");
        }else{
            var uri = $scope.browse.stack.pop();
            $location.url("/browse/"+uri);
        }
        $anchorScroll();
    };
    $scope.$on("browse", function (event, browseUri) {
        try{
            mopidy.library.browse({uri:browseUri}).then(function(response){
                $scope.browse.stack.push(browseUri);
                var albums = response.filter(function(ref){
                    return ref.type == "album";
                });
                var tracks = response.filter(function(ref){
                    return ref.type == "track";
                });
                if(!$scope.browse.results){
                    $scope.browse.results = {};
                }
                $scope.browse.results.tracks = tracks;
                $scope.browse.results.albums = albums;
                console.log("browse done:", response);
                $scope.$apply();
            });
            mopidy.library.getImages({"uris":[browseUri]}).then(function(data){
                $scope.browse.image = data[browseUri][0];
                console.log(data);
                $scope.$apply();
            });
        }catch (err){
            $location.url("/");
        }

    });
});
function findPlaying(searchresults, tracklist){
    var playing = {};
    tracklist.forEach(function(tltrack, i){
        searchresults.tracks.forEach(function(searchResultTrack){
            if(searchResultTrack.uri == tltrack.uri){
                playing[searchResultTrack.uri] = {inQueue: true, playingIn : i };
            }
        });
    });
    return playing;
}

jookApp.controller('BrowseController', function BrowseController($scope, $location, $http, $routeParams, $rootScope) {
    var browseUri = $routeParams.uri

    $rootScope.$broadcast("browse", browseUri);

    $scope.browseTo = function(uri){
        $location.url('/browse/'+uri);
    };

    $scope.play = function (uri) {
        $rootScope.$broadcast("playTrack", uri);
    };

    });

jookApp.controller('SearchController', function SearchController($scope, $location, $http, $httpParamSerializerJQLike, $cookies, $rootScope) {

    $scope.userUUID = $cookies.get('userUUID');

    $scope.performSearch = function (query) {
        $rootScope.$broadcast("search", query);
    };

    $scope.lookup = function (uri) {
        var name = $scope.search.results.artists.filter(function(artist){
            return artist.uri == uri;
        })[0].name;

        var browse = {uri:uri, name: name};
        $rootScope.$broadcast("browse", browse);
    };

    $scope.play = function (uri) {
        $rootScope.$broadcast("playTrack", uri);
    };

    $scope.browseTo = function (uri) {
        $location.url("/browse/"+uri);
    }
});

jookApp.controller('AlertController', function AlertController($scope) {

    $scope.alerts = [];

    $scope.$on("alert", function (event, args) {
        $scope.alerts.push({msg: args.message});
    });

    $scope.closeAlert = function (index) {
        $scope.alerts.splice(index, 1);
    };
});

jookApp.controller('ModalDemoCtrl', function ($uibModal, $log, $document, $scope) {
    var $ctrl = this;

    $ctrl.animationsEnabled = true;

    $ctrl.openPlaylist = function (size, parentSelector) {
        var parentElem = parentSelector ?
            angular.element($document[0].querySelector('.modal-demo ' + parentSelector)) : undefined;
        var modalInstance = $uibModal.open({
            animation: $ctrl.animationsEnabled,
            ariaLabelledBy: 'modal-title',
            ariaDescribedBy: 'modal-body',
            templateUrl: 'listModal.html',
            controller: 'ListController',
            controllerAs: '$ctrl',
            size: size,
            appendTo: parentElem,
            resolve: {
                items: function () {
                    var guestlist = [];
                    $scope.party.guests.forEach(function (item) {
                        guestlist.push({name:item.username});
                    });

                    var guestlistDetails = {list:guestlist};
                    return guestlistDetails;
                },
                heading: function () {
                    return "Who's here"
                }
            }
        });
    }

    $ctrl.openGuestlist = function (size, parentSelector) {
        var parentElem = parentSelector ?
            angular.element($document[0].querySelector('.modal-demo ' + parentSelector)) : undefined;
        var modalInstance = $uibModal.open({
            animation: $ctrl.animationsEnabled,
            ariaLabelledBy: 'modal-title',
            ariaDescribedBy: 'modal-body',
            templateUrl: 'listModal.html',
            controller: 'ListController',
            controllerAs: '$ctrl',
            size: size,
            appendTo: parentElem,
            resolve: {
                items: function () {
                    var tracks = [];
                    var userVoted = $scope.party.votedThisSong.indexOf($scope.userguid) > -1;
                    if($scope.party.tracklist){
                        $scope.party.tracklist.forEach(function (item) {
                            tracks.push({name: item.name + " by " + item.artists[0].name, uri:item.uri });
                        });
                    }

                    var tracklistDetails = {userVoted: userVoted, list:tracks};
                    return tracklistDetails;
                },
                heading: function () {
                    return "Playlist"
                }
            }
        });
    }
});

jookApp.controller('ListController', function ($uibModalInstance, $scope, $rootScope, items, heading) {
    var $ctrl = this;
    $ctrl.items = items;

    $scope.heading = heading;

    $scope.voteToPlayNext = function (uri) {
        $rootScope.$broadcast("voteToPlayNext", uri);
        $ctrl.items.userVoted = true;
    };

    $ctrl.cancel = function () {
        $uibModalInstance.close();
    };
});

function generateUUID () { // Public Domain/MIT
    var d = new Date().getTime();
    if (typeof performance !== 'undefined' && typeof performance.now === 'function'){
        d += performance.now(); //use high-precision timer if available
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = (d + Math.random() * 16) % 16 | 0;
        d = Math.floor(d / 16);
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}