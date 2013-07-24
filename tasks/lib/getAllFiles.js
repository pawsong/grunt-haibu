var path = require('path'),
    fs = require('fs');

module.exports =function getAllFiles(grunt, localRoot, ignore) {
    grunt.util = grunt.util || grunt.utils;

    var _ = grunt.util._;
    var file = grunt.file;

    var exclusions = [];

    for(var i = 0; i < ignore.length; i ++) {
        exclusions[i] = localRoot + path.sep +  ignore[i];
    }
    exclusions.push(localRoot + path.sep + '.git');

    // A method for parsing the source location and storing the information into a suitably formated object
    function dirParseSync(startDir, result) {
        var files;
        var i;
        var tmpPath;
        var currFile;

        // initialize the `result` object if it is the first iteration
        if (result === undefined) {
            result = {};
            result[path.sep] = [];
        }

        // check if `startDir` is a valid location
        if (!fs.existsSync(startDir)) {
            grunt.warn(startDir + ' is not an existing location');
        }

        // iterate throught the contents of the `startDir` location of the current iteration
        files = fs.readdirSync(startDir);
        for (i = 0; i < files.length; i++) {
            currFile = startDir + path.sep + files[i];
            if (!file.isMatch(exclusions, currFile)) {
                if (file.isDir(currFile)) {
                    tmpPath = path.relative(localRoot, startDir + path.sep + files[i]);
                    if (!_.has(result, tmpPath)) {
                        result[tmpPath] = [];
                    }
                    dirParseSync(startDir + path.sep + files[i], result);
                } else {
                    tmpPath = path.relative(localRoot, startDir);
                    if (!tmpPath.length) {
                        tmpPath = path.sep;
                    }
                    result[tmpPath].push(files[i]);
                }
            }
        }

        return result;
    }

    var rawFiles = dirParseSync(localRoot);

    var ret = [];

    for(var prop in rawFiles) {
        if(rawFiles.hasOwnProperty(prop)) {
            rawFiles[prop].forEach(function(file) {
                var entry = {
                    src: [ localRoot + path.sep + prop + path.sep + file],
                    orig: { expand: true, cwd: localRoot, src: [ '**.*' ] },
                    dest: prop + path.sep + file
                };
                ret.push(entry);
            });
        }
    }

    return ret;
};