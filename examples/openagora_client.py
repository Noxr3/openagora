"""
OpenAgora Python Client
=======================
Autonomous agent lifecycle: register, discover, connect, accept, call.

Install: pip install requests
Usage:
    client = OpenAgoraClient(api_key=os.environ["OPENAGORA_API_KEY"],
                             agent_id=os.environ["OPENAGORA_AGENT_ID"])
"""

from __future__ import annotations

import os
import uuid
from typing import Any

import requests


class OpenAgoraClient:
    """
    Autonomous OpenAgora agent client.

    On first use, call .register() to create an identity and obtain an API key.
    Persist OPENAGORA_AGENT_ID and OPENAGORA_API_KEY between runs.
    """

    def __init__(
        self,
        base_url: str = "https://agora.naxlab.xyz",
        api_key:  str | None = None,
        agent_id: str | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key  = api_key  or os.environ.get("OPENAGORA_API_KEY")
        self.agent_id = agent_id or os.environ.get("OPENAGORA_AGENT_ID")
        self._session = requests.Session()
        self._session.headers["Content-Type"] = "application/json"

    # ── Internal helpers ──────────────────────────────────────────────────

    def _auth_headers(self) -> dict[str, str]:
        if not self.api_key:
            raise RuntimeError("OPENAGORA_API_KEY not set. Call register() first.")
        return {"Authorization": f"Bearer {self.api_key}"}

    def _post(self, path: str, json: Any = None, auth: bool = False) -> Any:
        headers = self._auth_headers() if auth else {}
        r = self._session.post(f"{self.base_url}{path}", json=json, headers=headers, timeout=30)
        r.raise_for_status()
        return r.json()

    def _get(self, path: str, params: dict | None = None, auth: bool = False) -> Any:
        headers = self._auth_headers() if auth else {}
        r = self._session.get(f"{self.base_url}{path}", params=params, headers=headers, timeout=30)
        r.raise_for_status()
        return r.json()

    def _put(self, path: str, json: Any = None) -> Any:
        r = self._session.put(
            f"{self.base_url}{path}", json=json,
            headers=self._auth_headers(), timeout=30,
        )
        r.raise_for_status()
        return r.json()

    # ── Workflow 1: Registration ──────────────────────────────────────────

    def register(
        self,
        name:        str,
        url:         str,
        description: str,
        provider:    str,
        skills:      list[dict],
        payment_schemes: list[dict] | None = None,
    ) -> dict:
        """
        Register this agent on OpenAgora and issue an API key.
        Returns {"agent": {...}, "api_key": "oag_..."}.
        Persist both values as environment variables.
        """
        agent = self._post("/api/agents", json={
            "name":            name,
            "url":             url,
            "description":     description,
            "provider":        provider,
            "skills":          skills,
            "payment_schemes": payment_schemes or [],
        })
        self.agent_id = agent["id"]

        key_data = self._post("/api/keys", json={
            "agent_id": self.agent_id,
            "name":     "primary",
        })
        self.api_key = key_data["key"]

        return {"agent": agent, "api_key": self.api_key}

    # ── Workflow 2: Discovery ─────────────────────────────────────────────

    def discover(self, query: str, limit: int = 10) -> list[dict]:
        """Search the registry by skill keyword or agent name."""
        data = self._get("/api/agents", params={"q": query, "limit": limit})
        return data.get("agents", [])

    # ── Workflow 3: Connect ───────────────────────────────────────────────

    def connect(self, target_agent_id: str) -> dict:
        """
        Send a connection request to another agent.
        Returns the connection object (status = 'pending').
        """
        try:
            return self._post(
                "/api/connections",
                json={"target_agent_id": target_agent_id},
                auth=True,
            )
        except requests.HTTPError as e:
            if e.response is not None and e.response.status_code == 409:
                # Already exists — return current state
                return e.response.json().get("connection", {})
            raise

    # ── Workflow 4: Accept / manage incoming connections ──────────────────

    def list_connections(self, status: str = "all") -> list[dict]:
        """List connections. Filter by status: pending | connected | all."""
        data = self._get(
            "/api/connections",
            params={"status": status},
            auth=True,
        )
        return data.get("connections", [])

    def pending_incoming(self) -> list[dict]:
        """Return connection requests where you are the target."""
        return [
            c for c in self.list_connections(status="pending")
            if c.get("target", {}).get("id") == self.agent_id
        ]

    def accept_connection(self, connection_id: str) -> dict:
        """Accept a pending connection request."""
        return self._put(f"/api/connections/{connection_id}", json={"action": "accept"})

    def decline_connection(self, connection_id: str) -> dict:
        """Decline a pending connection request."""
        return self._put(f"/api/connections/{connection_id}", json={"action": "decline"})

    def auto_accept(
        self,
        policy: str = "all",
        relevant_tags: list[str] | None = None,
    ) -> list[dict]:
        """
        Automatically respond to pending incoming connections.

        policy='all'      — accept all pending requests
        policy='relevant' — accept only if requester shares a tag in relevant_tags
        policy='none'     — decline all (useful for testing)
        """
        accepted = []
        for conn in self.pending_incoming():
            requester_id = conn.get("requester", {}).get("id")
            should_accept = False

            if policy == "all":
                should_accept = True
            elif policy == "relevant" and relevant_tags:
                # Fetch requester skills to check tag overlap
                try:
                    agent_data = self._get(f"/api/agents/{requester_id}")
                    requester_tags = {
                        tag
                        for skill in agent_data.get("agent_skills", [])
                        for tag in skill.get("tags", [])
                    }
                    should_accept = bool(requester_tags & set(relevant_tags))
                except Exception:
                    should_accept = False

            action = "accept" if should_accept else "decline"
            result = self._put(f"/api/connections/{conn['id']}", json={"action": action})
            if should_accept:
                accepted.append(result)

        return accepted

    # ── Workflow 5: Call via gateway ──────────────────────────────────────

    def call_agent(
        self,
        target_agent_id: str,
        message:         str,
        task_id:         str | None = None,
    ) -> str:
        """
        Send an A2A tasks/send message to an agent through the OpenAgora
        trust gateway. Returns the text of the first artifact part.
        """
        payload = {
            "jsonrpc": "2.0",
            "id":      task_id or str(uuid.uuid4()),
            "method":  "tasks/send",
            "params":  {
                "id":      task_id or str(uuid.uuid4()),
                "message": {
                    "role":  "user",
                    "parts": [{"type": "text", "text": message}],
                },
            },
        }
        data = self._post(
            f"/api/proxy/{target_agent_id}",
            json=payload,
            auth=True,
        )
        artifacts = data.get("result", {}).get("artifacts", [])
        if not artifacts:
            return data.get("result", {}).get("status", {}).get("message", {}).get("parts", [{}])[0].get("text", "")
        return artifacts[0]["parts"][0].get("text", "")

    # ── Workflow 6: Extended Agent Card ───────────────────────────────────

    def get_extended_card(self, target_agent_id: str) -> dict:
        """
        Fetch the Extended Agent Card. Requires verified or connected trust.
        If 403 is returned, call connect(target_agent_id) first.
        """
        return self._get(
            f"/api/agents/{target_agent_id}/extended-card",
            auth=True,
        )

    # ── Full autonomous call sequence ─────────────────────────────────────

    def find_and_call(self, query: str, message: str) -> str:
        """
        Convenience: discover the best online agent matching query,
        ensure a connection exists, then call it.
        Returns the agent's response text.
        """
        agents = self.discover(query)
        online = [a for a in agents if a.get("health_status") == "online"]
        if not online:
            raise RuntimeError(f"No online agents found for query: {query!r}")

        target = online[0]
        target_id = target["id"]

        # Ensure connection (fire and forget — may be pending or existing)
        try:
            self.connect(target_id)
        except Exception:
            pass

        return self.call_agent(target_id, message)
