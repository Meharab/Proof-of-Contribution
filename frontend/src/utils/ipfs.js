// src/utils/ipfs.js
import { create } from "ipfs-http-client";

const ipfsUrl = import.meta.env.VITE_IPFS_API || "https://ipfs.infura.io:5001";

export const ipfsClient = create({ url: ipfsUrl });

export async function uploadJSON(obj) {
    const str = JSON.stringify(obj);
    const result = await ipfsClient.add(str);
    return result.path;
}
