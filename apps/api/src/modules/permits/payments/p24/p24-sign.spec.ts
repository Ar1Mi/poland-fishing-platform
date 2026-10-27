import { notificationSign, registerSign, signMatches, verifySign } from './p24-sign';

// Expected checksums computed outside the code under test:
// printf '%s' '<json>' | shasum -a 384
const CRC = '0123456789abcdef';
const SESSION_ID = '6f1c2d3e-4a5b-4c6d-8e7f-8091a2b3c4d5';

describe('Przelewy24 checksums', () => {
  it('signs a registration over sessionId, merchantId, amount, currency and crc', () => {
    expect(
      registerSign(
        { sessionId: SESSION_ID, merchantId: 11111, amount: 2500, currency: 'PLN' },
        CRC,
      ),
    ).toBe(
      'c9decb1b4a0a5aef0f43bb778c018d326c2ff308678271885041aaa3c41e35b1f2a7e78c5acc8d5e0dc76932e92eef2f',
    );
  });

  it('signs a notification with slashes and Polish letters left unescaped', () => {
    expect(
      notificationSign(
        {
          merchantId: 11111,
          posId: 11111,
          sessionId: SESSION_ID,
          amount: 2500,
          originAmount: 2500,
          currency: 'PLN',
          orderId: 316565874,
          methodId: 25,
          statement: 'p24-A1B-C2D-E3F/Zezwolenie ż',
        },
        CRC,
      ),
    ).toBe(
      '4799b114415f510e3184c00ffdf54b960785a98362331900cb890643531bb7a2758c318013f0c5dec63555ab823c1d7f',
    );
  });

  it('signs a verification over sessionId, orderId, amount, currency and crc', () => {
    expect(
      verifySign({ sessionId: SESSION_ID, orderId: 316565874, amount: 2500, currency: 'PLN' }, CRC),
    ).toBe(
      '96e1ea91ed470f0301946a4c7e434e717f8feda5fee58788816cda3d85b319b07c6d5618280ed59495a1e9fa59775683',
    );
  });

  it('keeps the documented field order whatever order the input has', () => {
    const fields = { currency: 'PLN', amount: 2500, merchantId: 11111, sessionId: SESSION_ID };

    expect(registerSign(fields, CRC)).toBe(
      'c9decb1b4a0a5aef0f43bb778c018d326c2ff308678271885041aaa3c41e35b1f2a7e78c5acc8d5e0dc76932e92eef2f',
    );
  });

  it('changes the checksum with another CRC key', () => {
    const fields = { sessionId: SESSION_ID, merchantId: 11111, amount: 2500, currency: 'PLN' };

    expect(registerSign(fields, 'other')).not.toBe(registerSign(fields, CRC));
  });

  it.each([
    ['the same checksum', 'abc', 'abc', true],
    ['another checksum of the same length', 'abd', 'abc', false],
    ['a shorter checksum', 'ab', 'abc', false],
  ])('compares %s', (_case, received, expected, matches) => {
    expect(signMatches(received, expected)).toBe(matches);
  });
});
