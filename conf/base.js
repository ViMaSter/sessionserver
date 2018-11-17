const path = require('path');

const srcPath = function(subdir) {
    return path.join(__dirname, "..", "src", subdir);
};

var rootDir = path.resolve(__dirname);
function DtsBundlePlugin() {}
DtsBundlePlugin.prototype.apply = function (compiler) {
    compiler.plugin('done', function () {
        var dts = require('dts-bundle');

        dts.bundle({
            name: 'SessionServer',
            main: rootDir + '/../dist/**/*.d.ts',
            out: rootDir + '/../dist/server.d.ts',
            removeSource: true,
            outputAsModuleFolder: true 
        });
    });
};

module.exports = {
	entry: './src/SessionServer.ts',
	target: 'node',
    devtool: 'inline-source-map',
	node: {
		fs: 'empty',
	},
	module: {
		rules: [
			{
				test: /\.tsx?$/,
				use: 'ts-loader',
				exclude: /node_modules/
			}
		]
	},
	resolve: {
		extensions: [ '.tsx', '.ts', '.jsx', '.js' ],
        alias: {
            Game: srcPath('Game'),
            PageServer: srcPath('PageServer'),
            SessionServer: srcPath('SessionServer')
        },
		modules: [
			'node_modules'
		]
	},
	output: {
		filename: 'server.js',
		path: path.resolve(__dirname, "..", "bin")
	},
	plugins: [ new DtsBundlePlugin() ]
};