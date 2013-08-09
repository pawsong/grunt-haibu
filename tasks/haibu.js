/*
 * grunt-haibu-deploy
 *
 */

'use strict';

module.exports = function(grunt) {
    // External modules
    var path = require('path'),
        async = require('async'),
        request = require('request'),
        fs = require('fs'),
        mkdirp = require('mkdirp'),
        wrench = require('wrench'),
        glob = require('glob'),
        url = require('url');

    // Constants
    var DEPLOY_TMP_DIR = '.deploy',
        TARBALL_PATH = DEPLOY_TMP_DIR + path.sep + 'app.tar';

    // Local libraries
    var compress = require('./lib/compress')(grunt);

    var prevTaskDone = false;

    var haibuUrl;

    grunt.registerMultiTask('haibu', 'Deploy to haibu server.', function() {
        var self = this;

        var options = self.options({
            haibuProtocol: 'http',
            haibuPort: 80,
            mode: 'normal',
            startScript: 'start.js',
            includeFile: '.haibuinclude',
            path: '.',
            subdomainEqualsToTarget: false
        });

        var packageJSON,
            appName,
            appFullName;

        if(!options.subdomain && options.subdomainEqualsToTarget) {
            options.subdomain = self.target;
        }

        function checkOptionExists(option) {
            if (!options[option]) {
                grunt.fail.warn('In normal mode, options.initScript must be specified.');
            }
        }

        checkOptionExists('path');

        packageJSON = grunt.file.readJSON(options.path + path.sep + 'package.json');

        /*
         * App full name should be unique becaise haibu clean method will clean up all the apps
         * if their name equals to each other even when they are running on different port.
         */
        appName = options.appName || (packageJSON && packageJSON.name);

        if (!appName) {
            grunt.fail.warn('Cannot get application name');
        }

        appFullName = [appName, self.target].join('_');

        if (fs.existsSync(options.startScript)) {
            grunt.fail.warn(options.startScript + 'in app root path is reserved file name for haibu deployment.');
        }

        // Check mode
        if (grunt.util._.include(['normal', 'static'], options.mode) === false) {
            grunt.fail.warn('Mode ' + String(options.mode).cyan + ' not supported.');
        }

        if (options.mode === 'normal') {
            checkOptionExists('initScript');
        }

        if (options.mode === 'static') {
            checkOptionExists('staticDir');
        }

        if(options.prevTask) {
            if(!prevTaskDone) {
                prevTaskDone = true;
                grunt.task.run([options.prevTask, self.nameArgs /*'haibu:' + self.target*/]);
                return;
            }
        }

        haibuUrl = url.format({
            protocol: options.haibuProtocol,
            hostname: (options.haibuSubdomain ? options.haibuSubdomain + '.' : '') + options.haibuDomain,
            port: options.haibuPort
        });

        // make directories
        function makeDirs (callback) {
            wrench.rmdirSyncRecursive(DEPLOY_TMP_DIR, true);
            mkdirp(DEPLOY_TMP_DIR, function(err) {
                callback(err);
            });
        }

        function generatePackageJSON(callback) {
            if(options.mode === 'normal') {

                if (!packageJSON.scripts) {
                    packageJSON.scripts = {};
                }
                packageJSON.scripts.start = options.startScript;

            } else if(options.mode === 'static') {

                // Override packageJSON var with template.
                packageJSON = fs.readFileSync(
                    path.resolve(__dirname, 'template', 'package.json.template'),
                    {encoding: 'utf8'}
                );

                // Maybe better way...
                packageJSON = packageJSON.replace(/{{appName}}/g, appName);
                packageJSON = packageJSON.replace(/{{startScript}}/g, options.startScript);

                packageJSON = JSON.parse(packageJSON);

            } else {
                return callback("Not valid mode");
            }

            fs.writeFile(DEPLOY_TMP_DIR + path.sep + 'package.json',
                JSON.stringify(packageJSON, null, 2), function(err) {
                    callback(err);
                });
        }

        function generateInitScript(callback) {

            var template;
            
            if (options.mode === 'normal') {

                template = fs.readFileSync(
                    path.resolve(__dirname, 'template', 'normal.js.template'),
                    {encoding: 'utf8'}
                );
                template = template.replace(/{{initScript}}/g, options.initScript);

            } else if (options.mode === 'static') {

                template = fs.readFileSync(
                    path.resolve(__dirname, 'template', 'static.js.template'),
                    {encoding: 'utf8'}
                );
                template = template.replace(/{{staticDir}}/g, options.staticDir);

            } else {
                callback("Not valid mode");
            }

            template = template.replace(/{{port}}/g, options.port);
            
            fs.writeFile(DEPLOY_TMP_DIR + path.sep + options.startScript, template, function(err) {
                callback(err);
            });
        }

        function compressSrc(callback) {
            var pkgExists,
                packageFile;

            var i;

            var includePath = options.path + path.sep + options.includeFile;

            // TODO: if include file does not exist, generate one.
            

            var files = [];

            fs.readFileSync(includePath).toString().split('\n').forEach(function (line) {
                if(line) {
                    var parsedFiles = glob.sync(line, { cwd: options.path });

                    parsedFiles.forEach(function(entry) {
                        var file = {
                            src: [ options.path + path.sep + entry ],
                            orig: { expand: true, cwd: options.path, src: [ '**.*' ] },
                            dest: entry
                        };
                        files.push(file);
                    });
                }
            });

            // Add package.json
            pkgExists = false;

            packageFile = {
                src: [DEPLOY_TMP_DIR + path.sep + 'package.json'],
                orig: { expand: true, cwd: options.path, src: [ '**.*' ] },
                dest: 'package.json'
            };

            for (i = 0; i < files.length; i++) {
                if(files[i].dest === 'package.json') {
                    pkgExists = true;
                    files[i] = packageFile;
                }
            }

            if(!pkgExists) {
                files.push(packageFile);
            }

            // Add start script
            files.push({
                src: [DEPLOY_TMP_DIR + path.sep + options.startScript],
                orig: { expand: true, cwd: options.path, src: [ '**.*' ] },
                dest: options.startScript
            });

            // Compress
            compress.options = {
                mode: 'tgz',
                archive: TARBALL_PATH
            };

            compress.tar(files, function() {
                callback(null);
            });
        }

        function cleanCurrentApp(callback) {
            var targetURL = haibuUrl  + '/drones/' + appFullName + '/clean';

            request.post({
                url: targetURL,
                form: {
                    user: options.userName,
                    name: appFullName
                }
            }, function (err, res, body) {
                if(err) { return callback(err); }
                grunt.log.ok("Cleaning existing application finished.");
                return callback(null);
            });
        }

        function deploy(callback) {
            var targetURL = haibuUrl + '/deploy/' + options.userName + '/' + appFullName;
            
            var stat = fs.statSync(TARBALL_PATH);
           
            fs.createReadStream(TARBALL_PATH).pipe(
                request.post({
                    url: targetURL,
                    headers: {
                        'Content-Length' : stat.size
                    }
                }, function (err, res, body) {
                    callback(err, body);
                })
            );
        }

        function verifyPort(body, callback) {

            var result;

            try {
                result = JSON.parse(body); //app information
            } catch (err) {
                return callback(err + '\n' + body);            
            }

            if(!result.drone) {
                return callback(body);
            }

            grunt.log.ok("");
            grunt.log.ok("Test application successfully spawned!");
            grunt.log.ok("- User name : " + options.userName);
            grunt.log.ok("- App name : " + appFullName);

            if(result.drone.port == options.port) {
                return callback(null);
            } else {
                grunt.log.error("But port is unexpected...");
                grunt.log.error("Used port: " + result.drone.port);
                grunt.log.error("Expected: " + options.port);
                grunt.log.error("Something going wrong... contact server admin.");

                return callback("Running port " +
                    result.drone.port + " is different from target port " + options.port);
            }
        }

        // make files
        var done = this.async();

        async.waterfall([
            makeDirs,
            generatePackageJSON,
            generateInitScript,
            compressSrc,
            cleanCurrentApp,
            deploy,
            verifyPort
        ], function(err) {
            var patt,
                domain;

            // TODO: Remove files


            // Parse errors
            if(err) {
                // Clean app
                grunt.log.error(err);
                grunt.fail.warn('Deploy failed.');
                return;
            }

            grunt.log.ok("");
            grunt.log.ok("Port is " + options.port + " which is right, expected.");
            grunt.log.ok("");
            grunt.log.ok("Test app is now started at:");
            grunt.log.ok("- " + url.format({
                protocol: options.haibuProtocol,
                hostname: options.haibuDomain,
                port: options.port
            }));

            if(options.subdomain) {
                grunt.log.ok("or")
                grunt.log.ok("- " + url.format({
                    protocol: options.haibuProtocol,
                    hostname: options.subdomain + '.' + options.haibuDomain
                }));
            }

            grunt.log.ok("");
            grunt.log.ok("Finished!");

            done();
        });
    });
};
