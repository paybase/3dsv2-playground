const h = require('vhtml')
const uuid = require('uuid/v4')
const crypto = require('crypto')
const fetch = require('node-fetch')
const html = require('htm').bind(h)
const { stringify, parse } = require('qs')
const { router, get, post } = require('microrouter')
const { send, json, text, buffer } = require('micro')

const base = 'https://kvdb.io/B3PXaY12sAj4ncmE7sjL6c'

const setKey = async (key, value) =>
  await fetch(`${base}/${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: value,
  })

const getKey = async key =>
  await fetch(`${base}/${key}`).then(res => (res.status == 200 ? res.text() : null))
const deleteKey = async key => await fetch(`${base}/${key}`, { method: 'DELETE' })

const key = 'Threeds2Test60System'
const cardstream_int_url = 'https://test.3ds-pit.com/direct/'
const cardstream_merchant_id_3ds = '100856'
const transactionUnique = uuid()

const new_test_data = (callback, userAgent, ref = null, parsedRes = null) => ({
  merchantID: cardstream_merchant_id_3ds,
  action: 'SALE',
  type: 1,
  currencyCode: 826,
  countryCode: 826,
  amount: '1.01',
  cardNumber: '4929421234600821',
  cardCVV: '356',
  cardExpiryMonth: '12',
  cardExpiryYear: '19',
  customerName: 'Test Customer',
  customerEmail: 'test@testcustomer.com',
  customerAddress: '16 Test Street',
  customerPostCode: 'TE15 5ST',
  orderRef: 'Test purchase',
  threeDSRedirectURL: callback,
  deviceType: 'desktop',
  deviceChannel: 'browser',
  deviceTimeZone: '0',
  deviceCapabilities: 'javascript',
  deviceScreenResolution: '1920x1080x1',
  deviceOperatingSystem: 'macos',
  deviceIdentity: userAgent,
  deviceAcceptContent: 'application/json',
  deviceAcceptEncoding: 'application/json',
  deviceAcceptLanguage: 'en-GB,en-US;q=0.9,en;q=0.8',
  deviceAcceptCharset: 'utf-8',
  remoteAddress: '127.0.0.1',
  transactionUnique,
  threeDSRef: ref,
  ...(parsedRes && { threeDSResponse: parsedRes }),
})

// coming from https://github.com/cardstream/nodejs-direct-sample/blob/master/Cardstream.js
const generateBody = (SIGNATURE_KEY, obj) => {
  var items = Object.keys(obj)
  var string = ''
  items.sort()
  const sortedObj = items.reduce((acc, k) => ({ ...acc, [k]: obj[k] }), {})
  string = stringify(sortedObj)
  // ss = (parent = null) => item => {
  //   const t = parent ? obj[parent][item] : obj[item]
  //   if (t || item !== 'threeDSRef') {
  //     if (t && typeof t === 'object') Object.keys(t).forEach(ss(item))
  //     else
  //       string += parent
  //         ? `${parent}[${item}]=${encodeURIComponent(t)}&`
  //         : `${item}=${encodeURIComponent(t)}&`
  //   }
  // }
  // items.forEach(ss())
  // string = string.slice(0, -1)
  string = string.replace(/\(/g, '%28')
  string = string.replace(/\)/g, '%29')
  string = string.replace(/%20/g, '+')
  return (
    string +
    '&signature=' +
    crypto
      .createHash('SHA512')
      .update(string + SIGNATURE_KEY)
      .digest('hex')
  )
}

const callc = params => {
  const body = generateBody(key, params)
  console.log('TCL: body', body)
  return fetch(cardstream_int_url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': body.length,
    },
    body,
  })
    .then(res => res.buffer())
    .then(buffer => buffer.toString('utf8'))
    .then(str => parse(str))
}

const ACSForm = async (res, { threeDSURL, threeDSRequest }) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(html`
    <html>
      <head>
        <style>
          body {
            margin: 0;
          }
        </style>
      </head>
      <body>
        <div>
          <h1>HTM λ News</h1>
          <p>We need 3D secure auth from you.</p>
          <form name="acs" action="${threeDSURL}" method="POST">
            ${Object.entries(threeDSRequest).map(
              ([k, v]) =>
                html`
                  <input
                    type="hidden"
                    name="${decodeURIComponent(k)}"
                    value="${decodeURIComponent(v)}"
                  />
                `,
            )}
            <button type="submit">Submit</button>
          </form>
        </div>
        <!-- <script>
          document.forms.acs.submit()
        </script> -->
      </body>
    </html>
  `)
}

const index = async (req, res) => {
  const parsedRes = parse(await text(req))

  const callback = `http://${req.headers.host}`
  const ref = await getKey('ref')
  const tt = new_test_data(
    callback,
    req.headers['user-agent'],
    ref,
    Object.keys(parsedRes).length ? parsedRes : null,
  )

  console.log('TCL: index -> url', req.url)
  console.log('TCL: index -> parsedRes', parsedRes)
  console.log('TCL: index -> ref', ref)
  console.log('TCL: index -> tt', tt)

  await callc(tt)
    .then(async data => {
      console.log('TCL: index -> responseCode', data.responseCode)
      console.log('TCL: index -> threeDSRef', data.threeDSRef)
      if (data.responseCode === '65802') {
        if (!ref) await setKey('ref', data.threeDSRef)
        ACSForm(res, { threeDSURL: data.threeDSURL, threeDSRequest: data.threeDSRequest })
      } else {
        console.log('TCL: index -> responseMessage', data.responseMessage)
        deleteKey('ref')
        send(res, 200, data)
      }
    })
    .catch(e => send(res, 500, e.message))
}

const favicon = (_, res) => send(res, 200, 'OK')
module.exports = router(post('/*', index), get('/favicon.ico', favicon), get('/*', index))
