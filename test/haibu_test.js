'use strict';

var grunt = require('grunt');
var path = require('path');
var zlib = require('zlib');
var fs = require('fs');
var tar = require('tar');
var compress = require('../tasks/lib/compress')(grunt);

exports.compress = {
    tar: function(test) {
        test.expect(1);
        var expected = [
            'folder_one/one.css', 'folder_one/one.js',
            'folder_two/two.css', 'folder_two/two.js',
            'test.css', 'test.js',
        ];
        var actual = [];
        var parse = tar.Parse();
        fs.createReadStream(path.join('tmp', 'compress_test_files.tar')).pipe(parse);
        parse.on('entry', function(entry) {
            actual.push(entry.path);
        });
        parse.on('end', function() {
            test.deepEqual(actual, expected, 'tar file should untar and contain all of the expected files');
            test.done();
        });
    },
    tgz: function(test) {
        test.expect(1);
        var expected = [
            'folder_one/one.css', 'folder_one/one.js',
            'folder_two/two.css', 'folder_two/two.js',
            'test.css', 'test.js',
        ];
        var actual = [];
        var parse = tar.Parse();
        fs.createReadStream(path.join('tmp', 'compress_test_files.tgz'))
            .pipe(zlib.createGunzip())
            .pipe(parse);
        parse.on('entry', function(entry) {
            actual.push(entry.path);
        });
        parse.on('end', function() {
            test.deepEqual(actual, expected, 'tgz file should gunzip/untar and contain all of the expected files');
            test.done();
        });
    },
};