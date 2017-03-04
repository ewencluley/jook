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


jookApp.controller('PartyController', function PartyController($scope, $http, $httpParamSerializerJQLike, $rootScope, $location, $cookies) {
    var connection = new WebSocket("ws://" + window.location.hostname + ":8001");

    var username;
    do{
        username = prompt("Please enter your name");
    }while(username == null || username == "");
    connection.onopen = function(event){
        var loginObject = {command:"login", username: username}
        connection.send(JSON.stringify(loginObject));
    }
    connection.onmessage = function (event) {
        var newPartyState = JSON.parse(event.data);
        console.log(newPartyState)
        $scope.party = newPartyState;
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
    }
});


jookApp.controller('SearchController', function SearchController($scope, $http, $httpParamSerializerJQLike, $cookies) {
    $scope.userUUID = $cookies.get('userUUID');

    $scope.search = function (query) {
        $http.get("/api/v1/media?q=" + query)
            .then(function (response) {
                $scope.searchResults = response.data[0];
            });
    };

    $scope.lookup = function (uri) {
        $http.get("/api/v1/media/" + uri)
            .then(function (response) {
                $scope.searchResults = response.data[0];
            });
    };

    $scope.play = function (uri) {
        $http({
            method: 'PUT',
            url: '/api/v1/queue/track',
            data: $httpParamSerializerJQLike({username: "harcoded", password: $scope.userUUID, uri: uri}),  // pass in data as strings
            headers: {'Content-Type': 'application/x-www-form-urlencoded'}  // set the headers so angular passing info as form data (not request payload)
        })
            .then(function (response) {
                console.log(response);
            });
    };
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
                    var guests = [];
                    $scope.party.guests.forEach(function (item) {
                        guests.push({name:item.username});
                    });
                    return guests;
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
                    if($scope.party.tracklist){
                        $scope.party.tracklist.forEach(function (item) {
                            tracks.push({name: item.track.name + " by " + item.track.artists[0].name });
                        });
                    }
                    return tracks;
                },
                heading: function () {
                    return "Playlist"
                }
            }
        });
    }
});

jookApp.controller('ListController', function ($uibModalInstance, $scope, items, heading) {
    var $ctrl = this;
    $ctrl.items = items;

    $scope.heading = heading;

    $ctrl.cancel = function () {
        $uibModalInstance.close();
    };
});