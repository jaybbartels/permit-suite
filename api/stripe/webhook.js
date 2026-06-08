// ── Stripe webhook handler ────────────────────────────────────────────────────
// Listens for subscription events and updates user role in Supabase
// Events handled:
//   customer.subscription.created  → upgrade to pro
//   customer.subscription.deleted  → downgrade to free
//   customer.subscription.updated  → handle plan changes

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

async function updateUserRole(stripeCustomerId, role) {
  // Find user by stripe_customer_id in metadata
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?filter=user_metadata->>stripe_customer_id.eq.${stripeCustomerId}`,
    {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
    }
  );
  if (!res.ok) return false;
  const { users } = await res.json();
  if (!users?.length) return false;

  const userId = users[0].id;
  const updateRes = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users/${userId}`,
    {
      method: 'PUT',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_metadata: {
          ...users[0].user_metadata,
          role,
        },
      }),
    }
  );
  return updateRes.ok;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, stripe-signature');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).end();

  // Stripe signature verification
  // When STRIPE_WEBHOOK_SECRET is set, verify the signature
  // During development (no secret set) skip verification
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    const body = JSON.stringify(req.body);

    if (STRIPE_WEBHOOK_SECRET && sig) {
      // Verify signature — requires raw body
      // Vercel provides raw body via req.body when content-type is application/json
      const { createHmac } = await import('crypto');
      const [timestampPart, ...sigParts] = sig.split(',');
      const timestamp = timestampPart.split('=')[1];
      const signature = sigParts.find(s => s.startsWith('v1='))?.split('=')[1];
      const signed    = `${timestamp}.${body}`;
      const expected  = createHmac('sha256', STRIPE_WEBHOOK_SECRET)
        .update(signed).digest('hex');
      if (expected !== signature) {
        return res.status(400).json({ error: 'Invalid signature' });
      }
    }

    event = req.body;
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub    = event.data.object;
        const custId = sub.customer;
        const active = ['active', 'trialing'].includes(sub.status);
        await updateUserRole(custId, active ? 'pro' : 'free');
        break;
      }
      case 'customer.subscription.deleted': {
        const sub    = event.data.object;
        await updateUserRole(sub.customer, 'free');
        break;
      }
      case 'checkout.session.completed': {
        // Store stripe_customer_id on user after first checkout
        const session  = event.data.object;
        const custId   = session.customer;
        const userId   = session.metadata?.supabase_user_id;
        if (userId && custId) {
          await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
            method: 'PUT',
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              user_metadata: { stripe_customer_id: custId, role: 'pro' },
            }),
          });
        }
        break;
      }
      default:
        // Ignore unhandled events
        break;
    }

    return res.status(200).json({ received: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
