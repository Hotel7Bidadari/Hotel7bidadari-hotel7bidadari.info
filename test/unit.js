// Native
const { join } = require('path')

// Packages
const { send } = require('micro')
const test = require('ava')
const sinon = require('sinon')
const { asc: alpha } = require('alpha-sort')
const loadJSON = require('load-json-file')
const fetch = require('node-fetch')

// Utilities
const createOutput = require('../src/util/output')
const hash = require('../src/providers/sh/util/hash')
const readMetadata = require('../src/providers/sh/util/read-metadata')
const getLocalConfigPath = require('../src/config/local-path')
const toHost = require('../src/providers/sh/util/to-host')
const wait = require('../src/util/output/wait')
const { responseError } = require('../src/providers/sh/util/error')
const getURL = require('./helpers/get-url')

const {
  npm: getNpmFiles_,
  docker: getDockerFiles_,
  staticFiles: getStaticFiles_
} = require('../src/providers/sh/util/get-files')

const output = createOutput({ debug: false })
const prefix = join(__dirname, 'fixtures', 'unit') + '/'
const base = path => path.replace(prefix, '')
const fixture = name => join(prefix, name)

// Overload to force debugging
const getNpmFiles = async dir => {
  const { pkg, nowConfig, hasNowJson } = await readMetadata(dir, {
    quiet: true,
    strict: false
  })

  return getNpmFiles_(dir, pkg, nowConfig, { hasNowJson, output })
}

const getDockerFiles = async dir => {
  const { nowConfig, hasNowJson } = await readMetadata(dir, {
    quiet: true,
    strict: false
  })

  return getDockerFiles_(dir, nowConfig, { hasNowJson, output })
}

const getStaticFiles = async dir => {
  const { nowConfig, hasNowJson } = await readMetadata(dir, {
    quiet: true,
    strict: false
  })

  return getStaticFiles_(dir, nowConfig, { hasNowJson, output })
}

test('`files`', async t => {
  let files = await getNpmFiles(fixture('files-in-package'))
  t.is(files.length, 3)
  files = files.sort(alpha)
  t.is(base(files[0]), 'files-in-package/build/a/b/c/d.js')
  t.is(base(files[1]), 'files-in-package/build/a/e.js')
  t.is(base(files[2]), 'files-in-package/package.json')
})

test('`files` + `.*.swp` + `.npmignore`', async t => {
  let files = await getNpmFiles(fixture('files-in-package-ignore'))
  files = files.sort(alpha)

  t.is(files.length, 4)
  t.is(base(files[0]), 'files-in-package-ignore/build/a/b/c/d.js')
  t.is(base(files[1]), 'files-in-package-ignore/build/a/e.js')
  t.is(base(files[2]), 'files-in-package-ignore/build/a/should-be-included.js')
  t.is(base(files[3]), 'files-in-package-ignore/package.json')
})

test('`files` overrides `.gitignore`', async t => {
  let files = await getNpmFiles(fixture('files-overrides-gitignore'))
  files = files.sort(alpha)

  t.is(files.length, 3)
  t.is(base(files[0]), 'files-overrides-gitignore/package.json')
  t.is(base(files[1]), 'files-overrides-gitignore/test.js')
  t.is(base(files[2]), 'files-overrides-gitignore/test.json')
})

test('`now.files` overrides `.gitignore` in Docker', async t => {
  const path = 'now-json-docker-gitignore-override'
  let files = await getDockerFiles(
    fixture(path),
    await loadJSON(getLocalConfigPath(fixture(path)))
  )
  files = files.sort(alpha)

  t.is(files.length, 5)
  t.is(base(files[0]), `${path}/Dockerfile`)
  t.is(base(files[1]), `${path}/a.js`)
  t.is(base(files[2]), `${path}/b.js`)
  t.is(base(files[3]), `${path}/build/a/c.js`)
  t.is(base(files[4]), `${path}/now.json`)
})

test('`now.files` overrides `.dockerignore` in Docker', async t => {
  const path = 'now-json-docker-dockerignore-override'
  let files = await getDockerFiles(
    fixture(path),
    await loadJSON(getLocalConfigPath(fixture(path)))
  )
  files = files.sort(alpha)

  t.is(files.length, 6)
  t.is(base(files[0]), `${path}/Dockerfile`)
  t.is(base(files[1]), `${path}/a.js`)
  t.is(base(files[2]), `${path}/b.js`)
  t.is(base(files[3]), `${path}/build/a/c.js`)
  t.is(base(files[4]), `${path}/c.js`)
  t.is(base(files[5]), `${path}/now.json`)
})

test('`now.files` overrides `.gitignore` in Node', async t => {
  const path = 'now-json-npm-gitignore-override'
  let files = await getNpmFiles(
    fixture(path),
    await loadJSON(getLocalConfigPath(fixture(path)))
  )
  files = files.sort(alpha)

  t.is(files.length, 5)
  t.is(base(files[0]), `${path}/a.js`)
  t.is(base(files[1]), `${path}/b.js`)
  t.is(base(files[2]), `${path}/build/a/c.js`)
  t.is(base(files[3]), `${path}/now.json`)
  t.is(base(files[4]), `${path}/package.json`)
})

test('`now.files` overrides `.npmignore` in Node', async t => {
  const path = 'now-json-npm-npmignore-override'
  let files = await getNpmFiles(
    fixture(path),
    await loadJSON(getLocalConfigPath(fixture(path)))
  )
  files = files.sort(alpha)

  t.is(files.length, 6)
  t.is(base(files[0]), `${path}/a.js`)
  t.is(base(files[1]), `${path}/b.js`)
  t.is(base(files[2]), `${path}/build/a/c.js`)
  t.is(base(files[3]), `${path}/c.js`)
  t.is(base(files[4]), `${path}/now.json`)
  t.is(base(files[5]), `${path}/package.json`)
})

test('`now.files` overrides `.gitignore` in Static', async t => {
  const path = 'now-json-static-gitignore-override'
  let files = await getStaticFiles(
    fixture(path),
    await loadJSON(getLocalConfigPath(fixture(path)))
  )
  files = files.sort(alpha)

  t.is(files.length, 3)
  t.is(base(files[0]), `${path}/a.js`)
  t.is(base(files[1]), `${path}/b.js`)
  t.is(base(files[2]), `${path}/build/a/c.js`)
})

test('`now.files` overrides `.npmignore`', async t => {
  let files = await getNpmFiles(fixture('now-files-overrides-npmignore'))
  files = files.sort(alpha)

  t.is(files.length, 3)
  t.is(base(files[0]), 'now-files-overrides-npmignore/package.json')
  t.is(base(files[1]), 'now-files-overrides-npmignore/test.js')
  t.is(base(files[2]), 'now-files-overrides-npmignore/test.json')
})

test('simple', async t => {
  let files = await getNpmFiles(fixture('simple'))
  files = files.sort(alpha)

  t.is(files.length, 5)
  t.is(base(files[0]), 'simple/bin/test')
  t.is(base(files[1]), 'simple/index.js')
  t.is(base(files[2]), 'simple/lib/woot')
  t.is(base(files[3]), 'simple/lib/woot.jsx')
  t.is(base(files[4]), 'simple/package.json')
})

test('simple with main', async t => {
  let files = await getNpmFiles(fixture('simple-main'))
  t.is(files.length, 3)
  files = files.sort(alpha)
  t.is(files.length, 3)
  t.is(base(files[0]), 'simple-main/build/a.js')
  t.is(base(files[1]), 'simple-main/index.js')
  t.is(base(files[2]), 'simple-main/package.json')
})

test('directory main', async t => {
  let files = await getNpmFiles(fixture('directory-main'))
  t.is(files.length, 3)
  files = files.sort(alpha)
  t.is(files.length, 3)
  t.is(base(files[0]), 'directory-main/a/index.js')
  t.is(base(files[1]), 'directory-main/build/a.js')
  t.is(base(files[2]), 'directory-main/package.json')
})

test('extensionless main', async t => {
  let files = await getNpmFiles(fixture('extensionless-main'))
  t.is(files.length, 3)
  files = files.sort(alpha)
  t.is(files.length, 3)
  t.is(base(files[0]), 'extensionless-main/build/a.js')
  t.is(base(files[1]), 'extensionless-main/index.js')
  t.is(base(files[2]), 'extensionless-main/package.json')
})

test('hashes', async t => {
  const files = await getNpmFiles(fixture('hashes'))
  const hashes = await hash(files)
  t.is(hashes.size, 3)
  const many = new Set(
    hashes.get('277c55a2042910b9fe706ad00859e008c1b7d172').names
  )
  t.is(many.size, 2)
  t.is(many.has(prefix + 'hashes/dei.png'), true)
  t.is(many.has(prefix + 'hashes/duplicate/dei.png'), true)
  t.is(
    hashes.get('56c00d0466fc6bdd41b13dac5fc920cc30a63b45').names[0],
    prefix + 'hashes/index.js'
  )
  t.is(
    hashes.get('706214f42ae940a01d2aa60c5e32408f4d2127dd').names[0],
    prefix + 'hashes/package.json'
  )
})

test('ignore node_modules', async t => {
  let files = await getNpmFiles(fixture('no-node_modules'))
  files = files.sort(alpha)
  t.is(files.length, 2)
  t.is(base(files[0]), 'no-node_modules/index.js')
  t.is(base(files[1]), 'no-node_modules/package.json')
})

test('ignore nested `node_modules` with .npmignore **', async t => {
  let files = await getNpmFiles(fixture('nested-node_modules'))
  files = files.sort(alpha)
  t.is(files.length, 2)
  t.is(base(files[0]), 'nested-node_modules/index.js')
  t.is(base(files[1]), 'nested-node_modules/package.json')
})

test('support whitelisting with .npmignore and !', async t => {
  let files = await getNpmFiles(fixture('negation'))
  files = files.sort(alpha)
  t.is(files.length, 2)
  t.is(base(files[0]), 'negation/a.js')
  t.is(base(files[1]), 'negation/package.json')
})

test('support `now.files`', async t => {
  let files = await getNpmFiles(fixture('now-files'))
  files = files.sort(alpha)
  t.is(files.length, 2)
  t.is(base(files[0]), 'now-files/b.js')
  t.is(base(files[1]), 'now-files/package.json')
})

test('support docker', async t => {
  let files = await getDockerFiles(fixture('dockerfile'))
  files = files.sort(alpha)
  t.is(files.length, 2)
  t.is(base(files[0]), 'dockerfile/Dockerfile')
  t.is(base(files[1]), 'dockerfile/a.js')
})

test('gets correct name of docker deployment', async t => {
  const { name, deploymentType } = await readMetadata(fixture('dockerfile'), {
    quiet: true,
    strict: false
  })

  t.is(deploymentType, 'docker')
  t.is(name, 'test')
})

test('prefix regression', async t => {
  let files = await getNpmFiles(fixture('prefix-regression'))
  files = files.sort(alpha)
  t.is(files.length, 2)
  t.is(base(files[0]), 'prefix-regression/package.json')
  t.is(base(files[1]), 'prefix-regression/woot.js')
})

test('support `now.json` files with package.json', async t => {
  let files = await getNpmFiles(fixture('now-json'))
  files = files.sort(alpha)
  t.is(files.length, 3)
  t.is(base(files[0]), 'now-json/b.js')
  t.is(base(files[1]), 'now-json/now.json')
  t.is(base(files[2]), 'now-json/package.json')
})

test('support `now.json` files with Dockerfile', async t => {
  const f = fixture('now-json-docker')
  const { deploymentType, nowConfig, hasNowJson } = await readMetadata(f, {
    quiet: true,
    strict: false
  })
  t.is(deploymentType, 'docker')

  let files = await getDockerFiles(f, nowConfig, { hasNowJson })
  files = files.sort(alpha)
  t.is(files.length, 3)
  t.is(base(files[0]), 'now-json-docker/Dockerfile')
  t.is(base(files[1]), 'now-json-docker/b.js')
  t.is(base(files[2]), 'now-json-docker/now.json')
})

test('throws when both `now.json` and `package.json:now` exist', async t => {
  let e
  try {
    await readMetadata(fixture('now-json-throws'), {
      quiet: true,
      strict: false
    })
  } catch (err) {
    e = err
  }
  t.is(e.name, 'Error')
  t.is(e.userError, true)
  t.pass(
    /please ensure there's a single source of configuration/i.test(e.message)
  )
})

test('throws when `package.json` and `Dockerfile` exist', async t => {
  let e
  try {
    await readMetadata(fixture('multiple-manifests-throws'), {
      quiet: true,
      strict: false
    })
  } catch (err) {
    e = err
  }
  t.is(e.userError, true)
  t.is(e.code, 'MULTIPLE_MANIFESTS')
  t.pass(/ambiguous deployment/i.test(e.message))
})

test('support `package.json:now.type` to bypass multiple manifests error', async t => {
  const f = fixture('type-in-package-now-with-dockerfile')
  const { type, nowConfig, hasNowJson } = await readMetadata(f, {
    quiet: true,
    strict: false
  })
  t.is(type, 'npm')
  t.is(nowConfig.type, 'npm')
  t.is(hasNowJson, false)
})

test('friendly error for malformed JSON', async t => {
  const err = await t.throws(
    readMetadata(fixture('json-syntax-error'), {
      quiet: true,
      strict: false
    })
  )
  t.is(err.name, 'JSONError')
  t.is(
    err.message,
    "Unexpected token 'o' at 2:5 in test/fixtures/unit/json-syntax-error/package.json\n    oops\n    ^"
  )
})

test('simple to host', t => {
  t.is(toHost('zeit.co'), 'zeit.co')
})

test('leading // to host', t => {
  t.is(toHost('//zeit-logos-rnemgaicnc.now.sh'), 'zeit-logos-rnemgaicnc.now.sh')
})

test('leading http:// to host', t => {
  t.is(
    toHost('http://zeit-logos-rnemgaicnc.now.sh'),
    'zeit-logos-rnemgaicnc.now.sh'
  )
})

test('leading https:// to host', t => {
  t.is(
    toHost('https://zeit-logos-rnemgaicnc.now.sh'),
    'zeit-logos-rnemgaicnc.now.sh'
  )
})

test('leading https:// and path to host', t => {
  t.is(
    toHost('https://zeit-logos-rnemgaicnc.now.sh/path'),
    'zeit-logos-rnemgaicnc.now.sh'
  )
})

test('simple and path to host', t => {
  t.is(toHost('zeit.co/test'), 'zeit.co')
})

test('`wait` utility does not invoke spinner before n miliseconds', async t => {
  const oraStub = sinon.stub().returns({
    color: '',
    start: () => {},
    stop: () => {}
  })
  
  const timeOut = 200
  const stop = wait('test', timeOut, oraStub)
  
  stop()

  t.truthy(oraStub.notCalled)
})

test('`wait` utility invokes spinner after n miliseconds', async t => {
  const oraStub = sinon.stub().returns({
    color: '',
    start: () => {},
    stop: () => {}
  })
  
  const timeOut = 200

  const delayedWait = () => {
    return new Promise((resolve) => {
      const stop = wait('test', timeOut, oraStub)
      
      setTimeout(() => {
        resolve()
        stop()
      }, timeOut + 100)
    })
  }

  await delayedWait()
  t.is(oraStub.calledOnce, true)
})

test('`wait` utility does not invoke spinner when stopped before delay', async t => {
  const oraStub = sinon.stub().returns({
    color: '',
    start: () => {},
    stop: () => {}
  })
  
  const timeOut = 200

  const delayedWait = () => {
    return new Promise((resolve) => {
      const stop = wait('test', timeOut, oraStub)
      stop()
      
      setTimeout(() => {
        resolve()
      }, timeOut + 100)
    })
  }

  await delayedWait()
  t.is(oraStub.notCalled, true)
})

test('4xx response error with fallback message', async t => {
  const fn = async (req, res) => {
    send(res, 404, {})
  }

  const url = await getURL(fn)
  const res = await fetch(url)
  const formatted = await responseError(res, 'Failed to load data')

  t.is(formatted.message, 'Failed to load data (404)')
})

test('4xx response error without fallback message', async t => {
  const fn = async (req, res) => {
    send(res, 404, {})
  }

  const url = await getURL(fn)
  const res = await fetch(url)
  const formatted = await responseError(res)

  t.is(formatted.message, 'Response Error (404)')
})

test('5xx response error without fallback message', async t => {
  const fn = async (req, res) => {
    send(res, 500, '')
  }

  const url = await getURL(fn)
  const res = await fetch(url)
  const formatted = await responseError(res)

  t.is(formatted.message, 'Response Error (500)')
})

test('4xx response error as correct JSON', async t => {
  const fn = async (req, res) => {
    send(res, 400, {
      error: {
        message: 'The request is not correct'
      }
    })
  }

  const url = await getURL(fn)
  const res = await fetch(url)
  const formatted = await responseError(res)

  t.is(formatted.message, 'The request is not correct (400)')
})

test('5xx response error as HTML', async t => {
  const fn = async (req, res) => {
    send(res, 500, 'This is a malformed error')
  }

  const url = await getURL(fn)
  const res = await fetch(url)
  const formatted = await responseError(res, 'Failed to process data')

  t.is(formatted.message, 'Failed to process data (500)')
})

test('5xx response error with random JSON', async t => {
  const fn = async (req, res) => {
    send(res, 500, {
      wrong: 'property'
    })
  }

  const url = await getURL(fn)
  const res = await fetch(url)
  const formatted = await responseError(res, 'Failed to process data')

  t.is(formatted.message, 'Failed to process data (500)')
})
