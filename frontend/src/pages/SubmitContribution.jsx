import React, { useState } from "react";
import { getSigner, getContract, canonicalHash } from "../utils/ethers";
import { uploadJSON } from "../utils/ipfs"; // optional

export default function SubmitContribution({ account }) {
    const [poolId, setPoolId] = useState("");
    const [cidOrCommit, setCidOrCommit] = useState("");
    const [metadata, setMetadata] = useState({ title: "", description: "" });
    const [loading, setLoading] = useState(false);

    async function submit() {
        if (!account) return alert("Connect wallet");
        try {
            setLoading(true);
            let payload = cidOrCommit;
            // If user provided metadata, upload and use returned CID as canonical pointer
            if (metadata.title || metadata.description) {
                const cid = await uploadJSON({ ...metadata, source: cidOrCommit || null, author: account });
                payload = cid;
            }

            const hash = canonicalHash(payload);
            const signer = await getSigner();
            const contract = getContract(undefined, signer);
            const tx = await contract.submitContribution(Number(poolId), hash);
            await tx.wait();
            alert("Submitted contribution");
        } catch (err) {
            console.error(err);
            alert(err?.message || err);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div>
            <h2>Submit Contribution</h2>
            <div style={{ display: "grid", gap: 8, maxWidth: 600 }}>
                <input placeholder="PoolId" value={poolId} onChange={(e) => setPoolId(e.target.value)} />
                <input placeholder="CID or commit string (or leave blank if uploading metadata)" value={cidOrCommit} onChange={(e) => setCidOrCommit(e.target.value)} />
                <input placeholder="Title (optional)" value={metadata.title} onChange={(e) => setMetadata({ ...metadata, title: e.target.value })} />
                <textarea placeholder="Description (optional)" value={metadata.description} onChange={(e) => setMetadata({ ...metadata, description: e.target.value })} />
                <button onClick={submit} disabled={loading}>{loading ? "Submitting..." : "Submit Contribution"}</button>
            </div>
            <small>Frontend computes the canonical hash using keccak256(utf8Bytes(payload)). Ensure attestors do the same.</small>
        </div>
    );
}
