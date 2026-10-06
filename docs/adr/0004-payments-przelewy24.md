# ADR-0004: Przelewy24 sandbox за интерфейсом `PaymentProvider`

- **Статус:** Принято
- **Дата:** 2026-10-06
- **Связано:** FR-08, сценарий А

## Контекст

Нужна реальная интеграция оплаты, привычная для польских пользователей, без реальных денег. Sandbox P24 бесплатный, тестовые данные берутся из раздела «Sandbox account» в панели P24; для автотестов и разработки без интернета нужна замена.

## Варианты

1. **Stripe** — отличный sandbox и документация, но менее типичен для польского рынка (BLIK/przelew).
2. **Przelewy24 REST API v1** — польский стандарт, sandbox, уведомление `urlStatus` с подписью.
3. **Только заглушка** — просто, но нет реальной интеграции для главы «Implementacja».

## Решение

Интерфейс `PaymentProvider` (паттерн Adapter) с реализациями `Przelewy24Provider` и `FakePaymentProvider`; выбор — переменная `PAYMENTS_PROVIDER`.

```ts
interface PaymentProvider {
  createTransaction(input: { sessionId: string; amountGrosze: number; description: string;
                             email: string; returnUrl: string; statusUrl: string }): Promise<{ redirectUrl: string }>;
  handleNotification(body: unknown): Promise<{ sessionId: string; providerOrderId: string; amountGrosze: number }>; // бросает при неверной подписи
  confirm(n: { sessionId: string; providerOrderId: string; amountGrosze: number }): Promise<void>; // P24: transaction/verify
}
```

Поток P24 (сверить детали с официальной документацией developers.przelewy24.pl перед реализацией):

1. `transaction/register` с подписью (SHA-384 от JSON с sessionId, merchantId, amount, currency, crc) → `token`; редирект на страницу оплаты с этим токеном.
2. P24 отправляет уведомление на `urlStatus`; проверяем подпись уведомления ключом CRC и сумму.
3. Вызываем `transaction/verify` — без него транзакция не считается завершённой.
4. Только после успешного verify: `Payment.SUCCEEDED`, `Permit.PAID`.

## Последствия

- Сценарий А в E2E и локально работает с `fake`; P24 проверяется вручную по чек-листу в `thesis-log.md`.
- Уведомление должно быть доступно извне: при локальной проверке sandbox — туннель (напр. cloudflared), в prod — публичный URL.
- Один sandbox-аккаунт платформы для всех организаций; выплаты организациям — вне рамок.
