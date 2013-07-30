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
        glob = require('glob');

    // Constants
    var TARBALL_PATH = '.deploy/app.tar';

    // Local libraries
    var compress = require('./lib/compress')(grunt);

    grunt.registerMultiTask('haibu', 'Deploy to haibu server.', function() {
        var self = this;

        var options = self.options({
            include: '.haibuinclude',
            appRoot: '.'
        });

        var outDir = options.appRoot + '/out/server';
        var appName = [grunt.file.readJSON('package.json').name, self.target].join('_');

        // make files
        function makeOutDir(callback) {
            wrench.rmdirSyncRecursive(outDir, true);

            mkdirp(outDir, function (err) {
                if (err) { return callback(err); }

                return callback(null);
            });
        }

        function generateInitScript(callback) {
            var template =
                fs.readFileSync(
                    path.resolve(__dirname, 'template', 'start.js.template'),
                    {encoding: 'utf8'}
                );

            template = template.replace(/{{port}}/g, self.data.port);
            template = template.replace(/{{initScript}}/g, options.initScript);

            fs.writeFile(outDir + path.sep + 'start.js', template, function (err) {
                if (err) { return callback(err); }
                return callback(null);
            });
        }

        function compressSrc(callback) {
            var includePath = options.appRoot + path.sep + options.include;

            var files = [];

            fs.readFileSync(includePath).toString().split('\n').forEach(function (line) {
                var parsedFiles = glob.sync(line, { cwd: options.appRoot });

                parsedFiles.forEach(function(entry) {
                    var file = {
                        src: [ options.appRoot + path.sep + entry ],
                        orig: { expand: true, cwd: options.appRoot, src: [ '**.*' ] },
                        dest: entry
                    };
                    files.push(file);
                });
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
            var targetURL =
                options.haibu_host + ':' + options.haibu_port + '/drones/' +
                    appName + '/clean';

            request.post({
                url: targetURL,
                form: {
                    user: options.username,
                    name: appName
                }
            }, function (err, res, body) {
                if(err) { return callback(err); }
                grunt.log.ok("Cleaning existing application finished.");
                return callback(null);
            });
        }

        function deploy(callback) {
            var targetURL =
                options.haibu_host + ':' + options.haibu_port + '/deploy/' +
                    options.username + '/' +
                    appName;

            fs.createReadStream(TARBALL_PATH)
                .pipe(request.post({
                    url: targetURL
                }, function (err, res, body) {
                    callback(err, body);
                }));
        }

        function verifyPort(body, callback) {
            grunt.log.ok("");
            grunt.log.ok("Test application successfully spawned!");
            grunt.log.ok("- User name : " + options.username);
            grunt.log.ok("- App name : " + appName);

            var result = JSON.parse(body); //app information

            if(result.drone.port == self.data.port) {
                callback(null);
            } else {
                grunt.log.error("But port is unexpected...");
                grunt.log.error("Used port: " + result.drone.port);
                grunt.log.error("Expected: " + self.data.port);
                grunt.log.error("Something going wrong... contact server admin.");

                callback("Running port " +
                    result.drone.port + " is different from target port " + self.data.port);
            }
        }

        // make files
        var done = this.async();

        async.waterfall([
            makeOutDir,
            generateInitScript,
            compressSrc,
            cleanCurrentApp,
            deploy,
            verifyPort
        ], function(err) {
            // TODO: Remove files


            // Parse errors
            if(err) {
                // Clean app
                grunt.log.error(err);
                grunt.fail.warn('Deploy failed.');
                return;
            }

            var patt = new RegExp( '^(.*:)//([a-z\-.]+)(:[0-9]+)?(.*)$');

            grunt.log.ok("");
            grunt.log.ok("Port is " + self.data.port + " which is right, expected.");
            grunt.log.ok("");
            grunt.log.ok("Test app is now started at:");
            grunt.log.ok("- http://" + patt.exec(options.haibu_host)[2] + ':' + self.data.port);
            grunt.log.ok("or")
            grunt.log.ok("- http://" + self.target + "." + patt.exec(options.haibu_host)[2]);
            grunt.log.ok("");
            grunt.log.ok("Finished!");

            done();
        });
    });
};
