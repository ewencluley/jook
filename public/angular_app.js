var jookApp = angular.module('jookApp', ['ngRoute', 'ui.bootstrap']);
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
    $root.$on('$routeChangeError', function(event, toState, toParams, fromState, fromParams, error){
        // this is required if you want to prevent the $UrlRouter reverting the URL to the previous valid location
        event.preventDefault();
        // Hide loading message
        $root.loadingView = false;
        if(fromState.status == 404  && toState.originalPath == '/home'){
            $location.path("/party");
        }
    });
}]);

jookApp.config(function($routeProvider) {
    $routeProvider

    // route for the home page
        .when('/party', {
            templateUrl : 'pages/party.html',
            controller  : 'PartyController',
            resolve: {
                party : function(srvLibrary) {
                    return srvLibrary.getParty();
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
                party : function(srvLibrary) {
                    return srvLibrary.getParty();
                }
            }
        })

        .otherwise({ redirectTo: '/home' });
});


jookApp.factory('srvLibrary', ['$http', function($http) {
    var sdo = {
        getParty: function() {
            var promise = $http.get('api/v1/party');
            promise.then(function(response) {
                console.log(response);
                return response.data;
            }, function (response) {
                console.log("woops!");
                return {message:"No party!"};
            });
            return promise;
        }
    }
    return sdo;
}]);


// Define the `PhoneListController` controller on the `phonecatApp` module
jookApp.controller('UserController', function UserController($scope, $http, $httpParamSerializerJQLike, $rootScope) {
    $scope.login = function () {
        $http({
            method: 'POST',
            url: '/api/v1/login',
            data: $httpParamSerializerJQLike($scope.user.login),  // pass in data as strings
            headers: {'Content-Type': 'application/x-www-form-urlencoded'}  // set the headers so angular passing info as form data (not request payload)
        }).then(function (response) {
            $scope.hostsName = response.data.hostsName;
            $scope.yourName = $scope.login.guestsName;
        }, function myError(response) {
            $rootScope.$broadcast("alert", { status: response.status, message:response.data.message });
        });
    };


});

jookApp.controller('PartyController', function PartyController($scope, $http, $httpParamSerializerJQLike, $rootScope, $location, party) {
    $scope.createParty = function(){
        $http({
            method  : 'POST',
            url     : '/api/v1/party',
            data    : $httpParamSerializerJQLike($scope.newparty),  // pass in data as strings
            headers : { 'Content-Type': 'application/x-www-form-urlencoded' }  // set the headers so angular passing info as form data (not request payload)
        }).then(function(response) {
            $rootScope.$broadcast("alert", { status: response.status, message:"Party started, now queue some tunes!" });
            $rootScope.party = response.data;
            $location.path("search");
        }, function myError(response) {
            $rootScope.$broadcast("alert", { status: response.status, message:response.data.message });
        });
    };
});


jookApp.controller('SearchController', function SearchController($scope, $http, $httpParamSerializerJQLike) {


    $scope.search = function(){
        $http.get("/api/v1/media?q="+$scope.searchQuery)
            .then(function(response) {
                $scope.searchResults = response.data;
            });
    }
});

jookApp.controller('HomeController', function HomeController($scope,party) {
    console.log(party);
    $scope.party = party.data;
    // if(!party){
    //     $location.path("/party");
    // }else{
    //     $location.path("/login");
    // }
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