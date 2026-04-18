import { useCallback, useEffect, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase-config';
import { useToast } from './Toast';

/**
 * Plaid Link launcher. Calls Firebase Cloud Function `createLinkToken` for the token,
 * then `exchangePublicToken` on success. Institutions persist in Firestore `plaidItems`.
 */
export default function PlaidLinkButton({ onSuccess }) {
  const [linkToken, setLinkToken] = useState(null);
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const create = httpsCallable(functions, 'createLinkToken');
        const res = await create({});
        if (!cancelled) setLinkToken(res.data?.link_token || null);
      } catch (err) {
        console.error(err);
        toast?.('Could not initialize Plaid — check Functions deploy and keys', 'error');
      }
    })();
    return () => { cancelled = true; };
  }, [toast]);

  const onPlaidSuccess = useCallback(async (public_token, metadata) => {
    try {
      const exchange = httpsCallable(functions, 'exchangePublicToken');
      await exchange({ public_token, institution: metadata?.institution });
      toast?.('Linked! Syncing transactions…', 'success');
      onSuccess?.();
    } catch (err) {
      console.error(err);
      toast?.('Link succeeded but server exchange failed', 'error');
    }
  }, [onSuccess, toast]);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: onPlaidSuccess,
  });

  return (
    <button
      onClick={() => open()}
      disabled={!ready || !linkToken}
      className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium px-4 py-2 rounded-lg transition-colors"
    >
      + Link account
    </button>
  );
}
