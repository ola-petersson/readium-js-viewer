# Instudy Readium version

## Setup

* `git clone --recursive -b master https://github.com/ola-petersson/readium-js-viewer.git readium-js-viewer`
* `cd readium-js-viewer`
* `git submodule update --init --recursive`
* `git checkout master && git submodule foreach --recursive "git checkout master"`

## Prepare

* `npm run prepare:all`

## Build

* `npm run build`

copy

* `build-output/_single-bundle/readium-js-viewer_all.js`
* `build-output/_single-bundle/readium-js-viewer_all.bundles.js`
* `build-output/_single-bundle/readium-js-viewer_all.js.map`

to scripts folder in Instudy