'use strict';
/*global module, require, return, console */
module.exports = function( server, databaseObj, helper, packageObj) {
    var FB = require('fb');
    var util = require("./utils");
    var https = require('https');

    /**
     * Here server is the main app object
     * databaseObj is the mapped database from the package.json file
     * helper object contains all the helpers methods.
     * packegeObj contains the packageObj file of your plugin.
     */

    /**
     * Initialize the plugin at time of server start.
     * init method should never have any argument
     * It is a constructor and is populated once the server starts.
     * @return {[type]} [description]
     */
    var init = function(){
        console.log("i am here");
        //Add google login..
        addUserGoogleLogin(server, databaseObj, helper, packageObj);
        //Add facebook login..
        addUserFbLogin(server, databaseObj, helper, packageObj);
    };


    //Visit this link for more info. https://developers.google.com/identity/sign-in/web/backend-auth
    var addUserGoogleLogin = function(server, databaseObj, helper, packageObj){
        var User = databaseObj.User;
        User.loginWithAccessToken = function(accessToken, callback){
            if(accessToken){
                var url = "https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=" + accessToken;

                https.get(
                    url,
                    function(res) {
                        res.on('data', function(data) {
                            if(data){
                                console.log("Printing the User info obtained from google..\n")
                                console.log(data);
                                //Now create user and login..
                                createUserOrLogin(data, packageObj, User,  callback);
                            }
                        });
                    }
                ).on('error', function(err) {
                    console.error("Error getting data from the google plus server.");
                    // Send error
                    callback(err, null);
                });
            }
        };

        User.remoteMethod(
            'loginWithGoogle',
            {
                description: 'Logins a user by authenticating it with google',
                accepts: [
                    { arg: 'accessToken', type: 'string', required: true, http: { source:'form'} }
                ],
                returns: {
                    arg: 'accessToken', type: 'object', root: true,
                    description:
                    'The response body contains properties of the AccessToken created on login.\n' +
                    'Depending on the value of `include` parameter, the body may contain ' +
                    'additional properties:\n\n' +
                    '  - `user` - `{User}` - Data of the currently logged in user. (`include=user`)\n\n'
                },
                http: {verb: 'post'}
            }

        );
    };




    var addUserFbLogin = function(server, databaseObj, helper, packageObj){
        var User = databaseObj.User;
        var FacebookAccessToken = databaseObj.FacebookAccessToken;

        //Now defining a method login with access token
        User.loginWithFb = function (accessToken, cb) {
            FB.setAccessToken(accessToken);
            FB.api('me', {fields: ['id', 'name', "first_name", "last_name", "email"]}, function (res) {
                if(!res || res.error) {
                    console.log(!res ? 'error occurred' : res.error);
                    var err = new Error('Invalid Access Token');
                    err.statusCode = 401;
                    cb(err);
                    return;
                }

                console.log("Printing the User info obtained from facebook..\n");
                console.log(res);

                //Now create user and login..
                createUserOrLogin(server, res, packageObj, User,  cb);
            });
        };


        User.remoteMethod(
            'loginWithFb',
            {
                description: 'Logins a user by authenticating it with an external entity',
                accepts: [
                    { arg: 'external_access_token', type: 'string', required: true, http: { source:'form'} }
                ],
                returns: {
                    arg: 'accessToken', type: 'object', root: true,
                    description:
                    'The response body contains properties of the AccessToken created on login.\n' +
                    'Depending on the value of `include` parameter, the body may contain ' +
                    'additional properties:\n\n' +
                    '  - `user` - `{User}` - Data of the currently logged in user. (`include=user`)\n\n'
                },
                http: {verb: 'post'}
            }
        );
    };



    //Create user or login user.....
    /**
     * Create a user if not availaible and then login user finally.
     * @param data  {object} {email: dummy@gmail.com, password:3535, firstName: robins, lastName: Gupta, id}
     * @param packageObj
     * @param User {Loopback User model}
     * @param callback
     */
    var createUserOrLogin = function(server, data, packageObj, User,   callback){
        // accessToken is valid, so
        var query = { email : data.email},
        password = packageObj.secretKey,
        AccessTokenModel


        User.findOne({where: query}, function (err, user){
            var defaultError = new Error('login failed');
            defaultError.statusCode = 401;
            defaultError.code = 'LOGIN_FAILED';

            if(err){
                callback(defaultError);
            }else if(!user){
                // User email not found in the db case, create a new profile and then log him in
                User.create({email: query.email, password: password, "firstName": data.first_name, "lastName": data.last_name}, function(err, user) {
                    if(err){
                        callback(defaultError);
                    }else{
                        User.login({ email: query.email, password: password}, function(err, accessToken){
                            if(err){
                                //User is not created using facebook signup but through other method...link the user

                            }
                            callback(null, accessToken);
                            //Now Storing value in the server..
                        });
                    }


                });
            }
            else{
                updateAccessTokenModel(server, data,  user, AccessTokenModel, thirdPartyAccessToken, type,  callback);
            }
        });
    };




    var updateAccessTokenModel = function(server, data,  userInstance, AccessTokenModel, thirdPartyAccessToken, type,  callback){

        userInstance.createAccessToken(86400, function(error, token) {
            if (error) {
                return callback(error);
            }else{
                token.__data.user = userInstance;
                console.log(token);
                //Now add the token to the callback function..
                callback(null,  token);
                //Now save the user to AccessToken model..
                data = {
                    "id": data.id,
                    "FbUserId": data.id,
                    "token": thirdPartyAccessToken,
                    "expires": new Date(token.ttl),
                    "type": type
                };
                console.log("updating values...");
                console.log(data);
                AccessTokenModel.upsert(data)
                    .then(function(values){
                        console.log(values);
                        console.log("successfully updated third party access token data.");
                    })
                    .catch(function(err){
                        console.error("Error updating access token for " + type );
                        console.error(err);
                    });
            }
        }); //createAccessToken

    };




    //return all the methods that you wish to provide user to extend this plugin.
    return {
        init: init
    };
}; //module.exports