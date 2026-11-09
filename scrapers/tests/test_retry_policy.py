"""Tests for bounded retries on transient official-source fetch failures."""

import unittest

from requests import Session

from scrapers.retry_policy import configure_retry_session


class RetryPolicyTests(unittest.TestCase):
    def test_retries_only_safe_get_requests_for_transient_statuses(self):
        session = configure_retry_session(Session())
        retry = session.get_adapter("https://example.test").max_retries

        self.assertEqual(retry.total, 3)
        self.assertEqual(retry.status, 3)
        self.assertTrue(retry.respect_retry_after_header)
        self.assertTrue(retry.is_retry("GET", 429))
        self.assertTrue(retry.is_retry("GET", 503))
        self.assertFalse(retry.is_retry("GET", 404))
        self.assertFalse(retry.is_retry("POST", 503))

    def test_retry_attempts_are_capped(self):
        retry = configure_retry_session(Session(), attempts=99).get_adapter("http://example.test").max_retries
        self.assertEqual(retry.total, 5)


if __name__ == "__main__":
    unittest.main()
