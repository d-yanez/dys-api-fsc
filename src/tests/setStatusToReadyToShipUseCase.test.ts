import test from 'node:test';
import assert from 'node:assert/strict';
import { SetStatusToReadyToShipUseCase } from '../application/use-cases/setStatusToReadyToShipUseCase';
import { ReadyToShipRepository } from '../domain/status/readyToShipRepository';

test('SetStatusToReadyToShipUseCase returns success payload for valid input', async () => {
  const repo: ReadyToShipRepository = {
    async setStatusToReadyToShip() {
      return {
        ok: true,
        action: 'SetStatusToReadyToShip',
        purchaseOrderId: '1150140518',
        purchaseOrderNumber: '3231960534'
      };
    }
  };

  const useCase = new SetStatusToReadyToShipUseCase(repo);
  const result = await useCase.execute({
    orderItemIds: [163398544],
    packageId: 'PKG00002CZXL5'
  });

  assert.equal(result.ok, true);
  assert.equal(result.action, 'SetStatusToReadyToShip');
});

test('SetStatusToReadyToShipUseCase validates orderItemIds and packageId', async () => {
  const repo: ReadyToShipRepository = {
    async setStatusToReadyToShip() {
      throw new Error('should not be called');
    }
  };

  const useCase = new SetStatusToReadyToShipUseCase(repo);

  await assert.rejects(
    async () => useCase.execute({ orderItemIds: [], packageId: 'PKG00002CZXL5' }),
    { message: 'Invalid orderItemIds' }
  );

  await assert.rejects(
    async () => useCase.execute({ orderItemIds: ['abc'], packageId: 'PKG00002CZXL5' }),
    { message: 'Invalid orderItemIds' }
  );

  await assert.rejects(
    async () => useCase.execute({ orderItemIds: [163398544], packageId: '' }),
    { message: 'Invalid packageId' }
  );
});
