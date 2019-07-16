const h = require('vhtml')
const uuid = require('uuid/v4')
const crypto = require('crypto')
const fetch = require('node-fetch')
const html = require('htm').bind(h)
const { stringify, parse } = require('querystring')
const { router, get, post } = require('microrouter')
const { send, json, text, buffer } = require('micro')

const key = 'Threeds2Test60System'
const cardstream_int_url = 'https://test.3ds-pit.com/direct/'
const cardstream_merchant_id_3ds = '100856'
const transactionUnique = uuid()

const new_test_data = callback => ({
  merchantID: cardstream_merchant_id_3ds,
  action: 'SALE',
  type: 1,
  currencyCode: 826,
  countryCode: 826,
  amount: 10001,
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
  deviceOperatingSystem: 'win',
  transactionUnique,
})

// coming from https://github.com/cardstream/nodejs-direct-sample/blob/master/Cardstream.js
const generateBody = (SIGNATURE_KEY, obj) => {
  var items = Object.keys(obj)
  var string = ''
  items.sort()
  items.forEach(function(item) {
    string += item + '=' + encodeURIComponent(obj[item]) + '&'
  })
  string = string.slice(0, -1)
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
    .then(r => console.log('TCL: result', r) || r)
    .then(str => parse(str))
}

const callback = async (req, res) => {
  const parsedRes = parse(await text(req))
  console.log('TCL: parsedRes', await text(req))

  const callback = `http://${req.headers.host}/callback`
  return await callc(new_test_data(callback, parsedRes.MD, parsedRes.PaRes))
    .then(async data => {
      console.log('TCL: callback: data', data)
      if (data.responseCode === '0') return send(res, 200, 'Transaction successfull')
      else return send(res, 200, data)
    })
    .catch(e => send(res, 500, e.message))
}

const send3DS = async (res, { threeDSURL, PaReq, threeDSRedirectURL }) => {
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
          <form action="${threeDSURL}" method="POST">
            <input type="hidden" name="PaReq" value="${PaReq}" />
            <button type="submit">Continue</button>
          </form>
        </div>
      </body>
    </html>
  `)
}

const index = async (req, res) => {
  const callback = `http://${req.headers.host}/callback`
  const data = new_test_data(callback)
  console.log('TCL: index -> data', data)
  await callc(data)
    .then(async data => {
      console.log('TCL: index -> result', data)
      if (data.responseCode === '65802')
        send3DS(res, {
          threeDSURL: data.threeDSURL,
          PaReq: data['threeDSRequest[PaReq]'],
          threeDSRedirectURL: data.threeDSRedirectURL,
        })
      else send(res, 200, data)
    })
    .catch(e => send(res, 500, e.message))
}
const success = async (req, res) => send(res, 200, 'Success Tx')

module.exports = router(post('/callback', callback), get('/success', success), get('/*', index))
