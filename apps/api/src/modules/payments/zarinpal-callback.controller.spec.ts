import { describe, expect, it, vi } from 'vitest';
import { Module, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { PaymentVerificationResponse } from '@iranyaragh/contracts';
import { PaymentVerificationService } from './payment-verification.service';
import { ZarinpalCallbackController } from './zarinpal-callback.controller';

const verification: PaymentVerificationResponse = {
  data: {
    verification: {
      paymentId: 'payment-1',
      status: 'PAID',
      provider: 'zarinpal',
      amount: { amount: '500000', currency: 'IRR' },
      authority: 'authority-1',
      outcome: 'VERIFIED',
      orderId: 'order-1',
      orderStatus: 'PAID',
    },
  },
};

function setup(result: () => Promise<PaymentVerificationResponse> = async () => verification) {
  const verify = vi.fn(result);
  const setHeader = vi.fn();
  const redirect = vi.fn();
  const json = vi.fn();
  const response = { setHeader, redirect, json } as unknown as Response;
  const config = { getOrThrow: vi.fn(() => 'https://shop.example.com') } as unknown as ConfigService;
  const controller = new ZarinpalCallbackController(
    { verify } as unknown as PaymentVerificationService,
    config,
  );
  return { controller, response, verify, setHeader, redirect, json };
}

describe('ZarinpalCallbackController browser return', () => {
  it('sends a real HTTP 303 without leaking gateway parameters to the storefront', async () => {
    const verify = vi.fn(async () => verification);
    @Module({
      controllers: [ZarinpalCallbackController],
      providers: [
        { provide: PaymentVerificationService, useValue: { verify } },
        { provide: ConfigService, useValue: { getOrThrow: () => 'https://shop.example.com' } },
      ],
    })
    class CallbackHarness {}
    const app = await NestFactory.create(CallbackHarness, { logger: false });
    try {
      app.enableVersioning({ type: VersioningType.URI });
      await app.listen(0, '127.0.0.1');
      const address = app.getHttpServer().address() as { port: number };
      const response = await fetch(
        `http://127.0.0.1:${address.port}/v1/payments/zarinpal/callback?Authority=authority-1&Status=OK`,
        { headers: { Accept: 'text/html' }, redirect: 'manual' },
      );
      expect(response.status, await response.clone().text()).toBe(303);
      expect(response.headers.get('location')).toBe('https://shop.example.com/payment/order-1/result');
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('referrer-policy')).toBe('no-referrer');
      const jsonResponse = await fetch(
        `http://127.0.0.1:${address.port}/v1/payments/zarinpal/callback?Authority=authority-1&Status=OK`,
        { headers: { Accept: 'application/json' } },
      );
      expect(jsonResponse.status).toBe(200);
      expect(await jsonResponse.json()).toEqual(verification);
      expect(verify).toHaveBeenCalledTimes(2);
    } finally {
      await app.close();
    }
  });

  it('verifies on the server before redirecting to the owned-order payment page', async () => {
    const { controller, response, verify, redirect, setHeader, json } = setup();
    await controller.callback('authority-1', 'OK', 'text/html,application/xhtml+xml', response);
    expect(verify).toHaveBeenCalledWith(expect.objectContaining({ authority: 'authority-1', status: 'OK' }));
    expect(redirect).toHaveBeenCalledWith(303, 'https://shop.example.com/payment/order-1/result');
    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(setHeader).toHaveBeenCalledWith('Referrer-Policy', 'no-referrer');
    expect(json).not.toHaveBeenCalled();
  });

  it('does not turn an unavailable or malformed callback into apparent success', async () => {
    const { controller, response, redirect } = setup(async () => { throw new Error('unavailable'); });
    await controller.callback('unknown', 'OK', 'text/html', response);
    expect(redirect).toHaveBeenCalledWith(303, 'https://shop.example.com/payment-return');
  });

  it('preserves the JSON verification contract and errors for API clients', async () => {
    const { controller, response, json, redirect } = setup();
    await controller.callback('authority-1', 'NOK', 'application/json', response);
    expect(json).toHaveBeenCalledWith(verification);
    expect(redirect).not.toHaveBeenCalled();

    const failed = setup(async () => { throw new Error('unavailable'); });
    await expect(failed.controller.callback('unknown', 'OK', 'application/json', failed.response))
      .rejects.toThrow('unavailable');
  });
});
