import { ethers } from "ethers";
import PocAbi from "../contracts/ProofOfContribution.json";

export const getProvider = () => {
    if (window.ethereum) return new ethers.BrowserProvider(window.ethereum);
    return ethers.getDefaultProvider();
};

export const requestAccounts = async () => {
    if (!window.ethereum) throw new Error("MetaMask not found");
    await window.ethereum.request({ method: "eth_requestAccounts" });
};

export const getSigner = async () => {
    await requestAccounts();
    const provider = getProvider();
    return provider.getSigner();
};

export const getContract = (address = import.meta.env.VITE_CONTRACT_ADDRESS, signer = null) => {
    if (!address) throw new Error("CONTRACT_ADDRESS not set in .env");
    if (signer) return new ethers.Contract(address, PocAbi.abi, signer);
    const provider = getProvider();
    return new ethers.Contract(address, PocAbi.abi, provider);
};

export const canonicalHash = (str) => ethers.keccak256(ethers.toUtf8Bytes(str));
