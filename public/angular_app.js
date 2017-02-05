var partifyApp = angular.module('partifyApp', ['ui.bootstrap', 'ngAnimate','ngRoute']);

partifyApp.config(function($routeProvider) {
    $routeProvider

    // route for the home page
        .when('/', {
            templateUrl : 'pages/login.html',
            controller  : 'UserController'
        })

        // route for the about page
        .when('/search', {
            templateUrl : 'pages/search.html',
            controller  : 'searchController'
        })

        // route for the contact page
        .when('/contact', {
            templateUrl : 'pages/contact.html',
            controller  : 'contactController'
        });
});

// Define the `PhoneListController` controller on the `phonecatApp` module
partifyApp.controller('UserController', function UserController($scope, $http, $httpParamSerializerJQLike) {
    $scope.login = function () {
        $http({
            method: 'POST',
            url: 'login',
            data: $httpParamSerializerJQLike(user.login),  // pass in data as strings
            headers: {'Content-Type': 'application/x-www-form-urlencoded'}  // set the headers so angular passing info as form data (not request payload)
        }).then(function (response) {
            $scope.hostsName = response.data.hostsName;
            $scope.yourName = $scope.login.guestsName;
        });
    };

    $scope.newParty = function(){
        $http({
            method  : 'POST',
            url     : 'party',
            data    : $httpParamSerializerJQLike($scope.user.newparty),  // pass in data as strings
            headers : { 'Content-Type': 'application/x-www-form-urlencoded' }  // set the headers so angular passing info as form data (not request payload)
        }).then(function(response) {
            $scope.yourName = $scope.user.newparty.username;
            $scope.hostsName = response.data.hostsName;
        });
    };
});

partifyApp.controller('SearchController', function SearchController($scope, $http, $httpParamSerializerJQLike) {


    $scope.search = function(){
        $http.get("media?q="+$scope.searchQuery)
            .then(function(response) {
                $scope.searchResults = response.data;
            });
    }
});