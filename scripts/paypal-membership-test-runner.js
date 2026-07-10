/* Node/Undici requires 204, 205 and 304 responses to have a null body.
   The PayPal test mock intentionally models PayPal's bodyless cancellation response. */
const NativeResponse = globalThis.Response;
globalThis.Response = class PayPalTestResponse extends NativeResponse {
  constructor(body, init = {}) {
    const status = Number(init && init.status || 200);
    const normalizedBody = [204, 205, 304].includes(status) && body === '' ? null : body;
    super(normalizedBody, init);
  }
};

require('./paypal-membership-test.js');
