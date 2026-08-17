import { TypeormCustomerReader } from './typeorm-customer-reader';

function mockRepo(findOneResult: unknown) {
  return { findOne: jest.fn().mockResolvedValue(findOneResult) } as any;
}

describe('TypeormCustomerReader', () => {
  it('converts the date birth_date column (a string at runtime) to a real Date', async () => {
    // CustomerScope.matchesBirthday() calls getMonth()/getDate() — a raw
    // 'YYYY-MM-DD' string here throws and the whole cart evaluation 500s.
    const reader = new TypeormCustomerReader(
      mockRepo({ id: 'cust-1', birthDate: '1990-08-01', groupId: undefined }),
      mockRepo(null),
      mockRepo(null),
    );

    const view = await reader.load('org-1', 'cust-1');

    expect(view?.birthDate).toBeInstanceOf(Date);
    // Calendar day must survive — not shifted by a UTC-midnight round trip.
    expect(view?.birthDate?.getMonth()).toBe(7);
    expect(view?.birthDate?.getDate()).toBe(1);
  });

  it('leaves birthDate undefined when the customer has none', async () => {
    const reader = new TypeormCustomerReader(
      mockRepo({ id: 'cust-1', birthDate: undefined }),
      mockRepo(null),
      mockRepo(null),
    );

    const view = await reader.load('org-1', 'cust-1');

    expect(view?.birthDate).toBeUndefined();
  });

  it('returns null for a customer in another organization', async () => {
    const reader = new TypeormCustomerReader(mockRepo(null), mockRepo(null), mockRepo(null));

    expect(await reader.load('org-1', 'cust-1')).toBeNull();
  });

  it('resolves cardTierId from the active card tier', async () => {
    const reader = new TypeormCustomerReader(
      mockRepo({ id: 'cust-1', birthDate: undefined }),
      mockRepo({ tier: 'GOLD' }),
      mockRepo({ id: 'tier-gold' }),
    );

    const view = await reader.load('org-1', 'cust-1');

    expect(view?.cardTierId).toBe('tier-gold');
  });
});
