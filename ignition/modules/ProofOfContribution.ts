import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("ProofOfContributionModule", (m) => {
  const proofOfContribution = m.contract("ProofOfContribution");
  return { proofOfContribution };
});
