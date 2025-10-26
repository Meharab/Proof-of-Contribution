import React, { useState } from "react";
import { getSigner, getContract } from "../utils/ethers";
import { ethers } from "ethers";

export default function ClaimWithAttestation({ account }) {
    const [poolId, setPoolId] = useState("");
    const [contributionId, setContributionId] = useState("");
    const [signature, setSignature] = useState("");
    const [timestamp, setTimestamp] = useState("");
    const [valid, setValid] = useState(true);
    const [loading, setLoading] = useState(false);

    async function claim() {
        if (!account) return alert("Connect wallet");
        try {
            setLoading(true);
            const signer = await getSigner();
            const contract = getContract(undefined, signer);
            // signature format: hex string
            const ts = Number(timestamp);
            await contract.claimWithAttestation(Number(poolId), Number(contributionId), valid, ts, signature);
            alert("Claim transaction sent");
        } catch (err) {
            console.error(err);
            alert(err?.message || err);
        } finally {
            setLoading(false);
        }
    }

    // convenience: paste full JSON containing the attestation
    function pasteJSON(e) {
        try {
            const obj = JSON.parse(e.target.value);
            if (obj.signature) setSignature(obj.signature);
            if (obj.poolId) setPoolId(String(obj.poolId));
            if (obj.contributionId) setContributionId(String(obj.contributionId));
            if (typeof obj.valid !== "undefined") setValid(Boolean(obj.valid));
            if (obj.timestamp) setTimestamp(String(obj.timestamp));
        } catch { }
    }

    return (
        <div>
            <h2>Claim with Attestation</h2>
            <div style={{ display: "grid", gap: 8, maxWidth: 700 }}>
                <input placeholder="poolId" value={poolId} onChange={(e) => setPoolId(e.target.value)} />
                <input placeholder="contributionId" value={contributionId} onChange={(e) => setContributionId(e.target.value)} />
                <label>
                    valid:
                    <select value={String(valid)} onChange={(e) => setValid(e.target.value === "true")}>
                        <option value="true">true</option>
                        <option value="false">false</option>
                    </select>
                </label>
                <input placeholder="timestamp (unix)" value={timestamp} onChange={(e) => setTimestamp(e.target.value)} />
                <textarea placeholder='signature or paste {"signature":"0x...","poolId":1,...}' onChange={pasteJSON} style={{ minHeight: 80 }} />
                <input placeholder="signature hex" value={signature} onChange={(e) => setSignature(e.target.value)} />
                <button onClick={claim} disabled={loading}>{loading ? "Claiming..." : "Claim"}</button>
            </div>

            <small>Tip: Attestor should sign EIP-712 typed data matching contract. The signature hex is required here.</small>
        </div>
    );
}
