var jookApp = angular.module('jookApp', ['ngRoute', 'ui.bootstrap', 'ngCookies']);
jookApp.config(['$locationProvider', function($locationProvider) {
    $locationProvider.hashPrefix('');
}]);
jookApp.run(['$rootScope', '$location', function($root, $location) {
    $root.$on('$routeChangeStart', function(e, curr, prev) {
        if (curr.$$route && curr.$$route.resolve) {
            // Show a loading message until promises aren't resolved
            $root.loadingView = true;
        }
    });
    $root.$on('$routeChangeSuccess', function(e, curr, prev) {
        // Hide loading message
        $root.loadingView = false;
    });
}]);

jookApp.config(function($routeProvider) {
    $routeProvider

    // route for the home page
        .when('/party', {
            templateUrl : 'pages/party.html',
            controller  : 'PartyController',
            resolve: {
                party : function(srvParty) {
                    return srvParty.getParty();
                }
            }
        })

        .when('/search', {
            templateUrl : 'pages/search.html',
            controller  : 'SearchController'
        })

        .when('/login', {
            templateUrl : 'pages/login.html',
            controller  : 'UserController'
        })

        .when('/home', {
            templateUrl : 'pages/home.html',
            controller  : 'HomeController',
            resolve: {
                party : function(srvParty) {
                    return srvParty.getParty();
                }
            }
        })

        .otherwise({ redirectTo: '/home' });
});


jookApp.factory('srvParty', ['$http', function($http) {
    var partyService = {
        getParty: function() {
            var promise = $http.get('api/v1/party').then(function(response) {
                console.log(response);
                return response.data;
            }, function (response) {
                console.log("woops!");
                if(response.status = 404){
                    return {noParty:true};
                }else{
                    throw {broken:"something really bad has gone wrong.  Unhandled"}
                }
            });
            return promise;
        }
    }
    return partyService;
}]);

jookApp.controller('UserController', function UserController($scope, $http, $httpParamSerializerJQLike, $rootScope, $cookies) {
    $scope.login = function () {
        $http({
            method: 'POST',
            url: '/api/v1/login',
            data: $httpParamSerializerJQLike($scope.user.login),  // pass in data as strings
            headers: {'Content-Type': 'application/x-www-form-urlencoded'}  // set the headers so angular passing info as form data (not request payload)
        }).then(function (response) {
            $cookies.put('userUUID', response.data.password);
            $cookies.put('username', response.data.username);
        }, function myError(response) {
            $rootScope.$broadcast("alert", { status: response.status, message:response.data.message });
        });
    };


});

jookApp.controller('PartyController', function PartyController($scope, $http, $httpParamSerializerJQLike, $rootScope, $location, $cookies, party) {

    $scope.party = party;
    $scope.partysettings = JSON.parse(JSON.stringify(party));
    $scope.userUUID = $cookies.get('userUUID');
    $scope.updateParty = function(){
        $scope.callPartyService('PUT');
    };
    $scope.createParty = function(){
        $scope.callPartyService('POST');
    };
    $scope.callPartyService = function(method){
        $http({
            method  : method,
            url     : '/api/v1/party',
            data    : $httpParamSerializerJQLike({username : $scope.partysettings.host.username, password : $scope.deviceFingerprint}),  // pass in data as strings
            headers : { 'Content-Type': 'application/x-www-form-urlencoded' }  // set the headers so angular passing info as form data (not request payload)
        }).then(function(response) {
            $cookies.put('userUUID', response.data.password);
            $cookies.put('username', response.data.username);
            $rootScope.$broadcast("alert", { status: response.status, message:"Party started, now queue some tunes!" });
            $rootScope.party = response.data;
            $location.path("search");
        }, function myError(response) {
            $rootScope.$broadcast("alert", { status: response.status, message:response.data.message });
        });
    }
});


jookApp.controller('SearchController', function SearchController($scope, $http, $httpParamSerializerJQLike, $cookies) {
    $scope.userUUID = $cookies.get('userUUID');

    $scope.search = function(){
        $http.get("/api/v1/media?q="+$scope.query)
            .then(function(response) {
                $scope.searchResults = response.data[0];
            });
    };

    $scope.play = function(uri){
        $http({
            method  : 'PUT',
            url     : '/api/v1/queue/track',
            data    : $httpParamSerializerJQLike({username : "harcoded", password : $scope.userUUID, uri: uri}),  // pass in data as strings
            headers : { 'Content-Type': 'application/x-www-form-urlencoded' }  // set the headers so angular passing info as form data (not request payload)
        })
            .then(function(response) {
                console.log(response);
            });
    };
});

jookApp.controller('HomeController', function HomeController($scope, $rootScope, $location, party) {
    console.log(party);
    if(party.noParty){
        $location.path("/party");
        $rootScope.$broadcast("alert", { status: 404, message:"There is no party currently, get started by creating one!" });
    }else{
        $location.path("/login");
    }
});

jookApp.controller('AlertController', function AlertController($scope) {

    $scope.alerts = [];

    $scope.$on("alert", function (event, args) {
        $scope.alerts.push({msg: args.message});
    });

    $scope.closeAlert = function(index) {
        $scope.alerts.splice(index, 1);
    };
});