/*
 * grunt-contrib-compress
 * http://gruntjs.com/
 *
 * Copyright (c) 2013 Chris Talkington, contributors
 * Licensed under the MIT license.
 */

'use strict';

var fs = require('fs');
var path = require('path');
var prettySize = require('prettysize');
var zlib = require('zlib');
var archiver = require('archiver');
var Readable = require('lazystream').Readable;

module.exports = function(grunt) {

    var exports = {
        options: {}
    };

    // Compress with tar, tgz and zip
    exports.tar = function(files, done) {
        if (typeof exports.options.archive !== 'string' || exports.options.archive.length === 0) {
            grunt.fail.warn('Unable to compress; no valid archive file was specified.');
        }

        var mode = exports.options.mode;
        var shouldGzip = false;
        if (mode === 'tgz') {
            shouldGzip = true;
            mode = 'tar';
        }

        var archive = archiver.create(mode, exports.options);
        var dest = exports.options.archive;

        // Ensure dest folder exists
        grunt.file.mkdir(path.dirname(dest));

        // Where to write the file
        var destStream = fs.createWriteStream(dest);
        var gzipStream;

        archive.on('error', function(err) {
            grunt.log.error(err);
            grunt.fail.warn('Archiving failed.');
        });

        destStream.on('error', function(err) {
            grunt.log.error(err);
            grunt.fail.warn('WriteStream failed.');
        });

        destStream.on('close', function() {
            grunt.log.writeln('Created ' + String(dest).cyan + ' (' + exports.getSize(dest) + ')');
            done();
        });

        if (shouldGzip) {
            gzipStream = zlib.createGzip(exports.options);

            gzipStream.on('error', function(err) {
                grunt.log.error(err);
                grunt.fail.warn('Gziping failed.');
            });

            archive.pipe(gzipStream).pipe(destStream);
        } else {
            archive.pipe(destStream);
        }

        files.forEach(function(file) {
            var isExpandedPair = file.orig.expand || false;
            var src = file.src.filter(function(f) {
                return grunt.file.isFile(f);
            });

            src.forEach(function(srcFile) {
                var internalFileName = (isExpandedPair) ? file.dest : exports.unixifyPath(path.join(file.dest || '', srcFile));
                var srcStream = new Readable(function() {
                    return fs.createReadStream(srcFile);
                });

                archive.append(srcStream, { name: internalFileName }, function(err) {
                    grunt.verbose.writeln('Archiving ' + srcFile.cyan + ' -> ' + String(dest).cyan + '/'.cyan + internalFileName.cyan);
                });
            });
        });

        archive.finalize();
    };

    exports.getSize = function(filename, pretty) {
        var size = 0;
        if (typeof filename === 'string') {
            try {
                size = fs.statSync(filename).size;
            } catch (e) {}
        } else {
            size = filename;
        }
        if (pretty !== false) {
            if (!exports.options.pretty) {
                return size + ' bytes';
            }
            return prettySize(size);
        }
        return Number(size);
    };

    exports.unixifyPath = function(filepath) {
        if (process.platform === 'win32') {
            return filepath.replace(/\\/g, '/');
        } else {
            return filepath;
        }
    };

    return exports;
};
