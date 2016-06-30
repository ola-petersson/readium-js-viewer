define(['jquery', './ModuleConfig', './PackageParser', './workers/WorkerProxy', 'StorageManager', 'i18nStrings', 'URIjs', './EpubLibraryOPDS'], function ($, moduleConfig, PackageParser, WorkerProxy, StorageManager, Strings, URI, EpubLibraryOPDS) {

    var LibraryManager = function(){
    };

    var adjustEpubLibraryPath = function(path) {

        if (!path || !moduleConfig.epubLibraryPath) return path;

        var pathUri = undefined;
        try {
            pathUri = new URI(path);
        } catch(err) {
            console.error(err);
            console.log(path);
        }
        
        if (pathUri && pathUri.is("absolute")) return path; // "http://", "https://", "data:", etc.

        if (path.indexOf("epub_content/") == 0) {
            path = path.replace("epub_content/", "");
        }

        var parts = moduleConfig.epubLibraryPath.split('/');
        parts.pop();

        var root = parts.join('/');
        path = root + (path.charAt(0) == '/' ? '' : '/') + path;

        return path;
    };

    LibraryManager.prototype = {

       _getFullUrl : function(packageUrl, relativeUrl){
            if (!relativeUrl){
                return null;
            }

            var parts = packageUrl.split('/');
            parts.pop();

            var root = parts.join('/');

            return root + (relativeUrl.charAt(0) == '/' ? '' : '/') + relativeUrl
        },

        // TODO: see disabled usage in EpubLibrary.js
        // resetLibraryData: function() {
        //     this.libraryData = undefined;
        // },

        retrieveAvailableEpubs : function(success, error){
            if (this.libraryData){
                success(this.libraryData);
                return;
            }

            var self = this;

            //npm run chromeApp && npm run dist:chromeApp:copy:ebooks
            var checkDefaultPreloadedEbooks = function(success_callback) {

                if (!self.libraryData) {
                    
                    success_callback(self.libraryData);
                    return;
                }

                if (self.libraryData.length) {
                    
                    success_callback(self.libraryData);
                    return;
                }

                var importEPUB = function(rootDir, done_cb) {

                    var rootUrl = window.location.origin + '/ebooks/' + rootDir; //.replace(/chrome-extension/g, "chrome-extension-resource") see CSP 'filesystem://' + 
                    var epubUrl = rootUrl + '.epub';
console.debug("IMPORTING PRELOADED EPUB ... " + epubUrl);
                    var xhr = new XMLHttpRequest();
                    xhr.open('GET', epubUrl, true);
                    xhr.responseType = 'arraybuffer';
                    xhr.onerror = function() {
                        done_cb();
                    };

                    xhr.onload = function (loadEvent) {
                        var blob = new Blob([xhr.response], {
                            type: "application/epub+zip" //ContentTypeDiscovery.identifyContentTypeFromFileName(epubUrl)
                        });
                        self.handleZippedEpub({
                            file: blob,
                            overwrite: function(originalData, replaceCallback, keepBothCallback){
                                keepBothCallback();
                                //replaceCallback(); 
                            },
                            success: function(){
                                //Dialogs.closeModal();
    
                                done_cb();
                            },
                            progress: undefined, //Dialogs.updateProgress,
                            error: function() {
                                done_cb();
                            }
                        });
                    };

                    xhr.send();
                };

                var maxEPUBsIterations = 3; //100

                var importEPUBs = function() {
                    importEPUB('epubReadingSystem', function() {
                        importEPUB('epubReadingSystem_EX', function() {
                            importEPUB('internal_link', function() {
                                if (--maxEPUBsIterations > 0) {
                                    importEPUBs();
                                    return;
                                }
//console.log(self.libraryData);
                                success_callback(self.libraryData);
                            }); 
                        });
                    });
                };
                importEPUBs();

//                 var packagePath = 'EPUB/package.opf';
//                 var packageUrl = rootUrl + '/' + packagePath;
//                 var noCoverBackground = "images/covers/cover1.jpg";
                
//                 var success_ = function(jsonObj) {
// console.debug(jsonObj);
//                     var epubObj = {
//                         preloaded: true,
//                         coverHref: jsonObj.coverHref ? self._getFullUrl(packageUrl, jsonObj.coverHref) : undefined,
//                         id: jsonObj.id,
//                         rootDir : rootDir,
//                         packagePath : packagePath,
//                         title: jsonObj.title,
//                         author: jsonObj.author,
//                         rootUrl : rootUrl
//                     }
// console.debug(epubObj);
//                     self.libraryData.push(epubObj);

//                     success_callback(self.libraryData);
//                 };
//                 var error_ = function() {
//                     success_callback(self.libraryData);
//                 };
//                 self.retrieveFullEpubDetails(packageUrl, rootUrl, rootDir, noCoverBackground, success_, error_);


            };

            var indexUrl = moduleConfig.epubLibraryPath
                        ? StorageManager.getPathUrl(moduleConfig.epubLibraryPath)
                        : StorageManager.getPathUrl('/epub_library.json');

            var dataFail = function() {
                console.error("Ebook library fail: " + indexUrl);
                
                self.libraryData = [];

                checkDefaultPreloadedEbooks(success);
            };
            
            var dataSuccess = function(data) {
                console.log("Ebook library success: " + indexUrl);
                
                if (moduleConfig.epubLibraryPath) {
                    for (var i = 0; i < data.length; i++) {
                        data[i].coverHref = adjustEpubLibraryPath(data[i].coverHref);
                        data[i].rootUrl = adjustEpubLibraryPath(data[i].rootUrl);
                    }
                }
                
                self.libraryData = data;
                
                checkDefaultPreloadedEbooks(success);
            };

            if (/\.json$/.test(indexUrl)) {
                
                $.getJSON(indexUrl, function(data){
                    dataSuccess(data);
                }).fail(function(){
                    dataFail();
                });
            } else {
                EpubLibraryOPDS.tryParse(indexUrl, dataSuccess, dataFail);
            }
        },

        deleteEpubWithId : function(id, success, error){
            WorkerProxy.deleteEpub(id, this.libraryData, {
                success: this._refreshLibraryFromWorker.bind(this, success),
                error: error
            });
        },
        retrieveFullEpubDetails : function(packageUrl, rootUrl, rootDir, noCoverBackground, success, error){
            var self = this;

            $.get(packageUrl, function(data){
    
                if(typeof(data) === "string" ) {
                    var parser = new window.DOMParser;
                    data = parser.parseFromString(data, 'text/xml');
                }
                var jsonObj = PackageParser.parsePackageDom(data, packageUrl);
                jsonObj.coverHref = jsonObj.coverHref ? self._getFullUrl(packageUrl, jsonObj.coverHref) : undefined;
                jsonObj.packageUrl = packageUrl;
                jsonObj.rootDir = rootDir;
                jsonObj.rootUrl = rootUrl;
                jsonObj.noCoverBackground = noCoverBackground;

                success(jsonObj);

            }).fail(error);
        },
        _refreshLibraryFromWorker : function(callback, newLibraryData){

            if (newLibraryData) {
                this.libraryData = newLibraryData;
            }
            callback();
        },
        handleZippedEpub : function(options){
            WorkerProxy.importZip(options.file, this.libraryData, {
                progress : options.progress,
                overwrite: options.overwrite,
                success: this._refreshLibraryFromWorker.bind(this, options.success),
                error : options.error
            });
            //Dialogs.showModalProgress()
            //unzipper.extractAll();
        },
        handleDirectoryImport : function(options){

            var rawFiles = options.files,
                files = {};
            for (var i = 0; i < rawFiles.length; i++){
                 var path = rawFiles[i].webkitRelativePath
                // don't capture paths that contain . at the beginning of a file or dir.
                // These are hidden files. I don't think chrome will ever reference
                // a file using double dot "/.." so this should be safe
                if (path.indexOf('/.') != -1){
                    continue;
                }
                var parts = path.split('/');

                parts.shift();
                var shiftPath = parts.join('/');

                files[shiftPath] = rawFiles[i];
            }

            WorkerProxy.importDirectory(files, this.libraryData, {
                progress : options.progress,
                overwrite: options.overwrite,
                success: this._refreshLibraryFromWorker.bind(this, options.success),
                error : options.error
            });
        },
        handleUrlImport : function(options){
            WorkerProxy.importUrl(options.url, this.libraryData, {
                progress : options.progress,
                overwrite: options.overwrite,
                success: this._refreshLibraryFromWorker.bind(this, options.success),
                error : options.error

            });
        },
        handleMigration : function(options){
            WorkerProxy.migrateOldBooks({
                progress : options.progress,
                success: this._refreshLibraryFromWorker.bind(this, options.success),
                error : options.error
            });
        },
        handleUrl : function(options){

        },
        canHandleUrl : function(){
            return moduleConfig.canHandleUrl;
        },
        canHandleDirectory : function(){
            return moduleConfig.canHandleDirectory;
        }
    }

    window.cleanEntireLibrary = function(){
        StorageManager.deleteFile('/', function(){
            console.log('done');
        }, console.error);
    }
    return new LibraryManager();

});
