import { expect } from "chai";
import { ethers } from "hardhat";

describe("ProofOfContribution (unit tests)", function () {
  let deployer, sponsor, contributor, attestor, other;
  let MockERC20, mockToken;
  let Poc, poc;
  let chainId;

  const canonicalHash = (str) => ethers.keccak256(ethers.toUtf8Bytes(str));

  beforeEach(async () => {
    [deployer, sponsor, contributor, attestor, other] = await ethers.getSigners();
    chainId = (await ethers.provider.getNetwork()).chainId;

    MockERC20 = await ethers.getContractFactory("MockERC20");
    mockToken = await MockERC20.connect(deployer).deploy("MockToken", "MTK");
    await mockToken.waitForDeployment();

    Poc = await ethers.getContractFactory("ProofOfContribution");
    poc = await Poc.connect(deployer).deploy();
    await poc.waitForDeployment();

    const initialSponsorAmount = ethers.parseUnits("1000", 18);
    await mockToken.connect(deployer).mint(sponsor.address, initialSponsorAmount);
    await mockToken.connect(sponsor).approve(poc.target, initialSponsorAmount);
  });

  it("createPool: sponsor can create pool and fund deposit is transferred to contract", async function () {
    const fund = ethers.parseUnits("500", 18);
    const reward = ethers.parseUnits("10", 18);
    const tx = await poc.connect(sponsor).createPool(mockToken.target, fund, reward, 0);
    await tx.wait();

    const poolId = await poc.poolCount();
    const pool = await poc.getPool(poolId);

    expect(pool.creator).to.equal(sponsor.address);
    expect(pool.token).to.equal(mockToken.target);
    expect(pool.totalFund).to.equal(fund);
    expect(pool.rewardPerContribution).to.equal(reward);

    const contractBal = await mockToken.balanceOf(poc.target);
    expect(contractBal).to.equal(fund);
  });

  it("submitContribution: stores contribution hash and emits event", async function () {
    const fund = ethers.parseUnits("200", 18);
    const reward = ethers.parseUnits("20", 18);
    await poc.connect(sponsor).createPool(mockToken.target, fund, reward, 0);
    const poolId = await poc.poolCount();

    const cidString = "QmFakeCIDForTesting";
    const hash = canonicalHash(cidString);

    const tx = await poc.connect(contributor).submitContribution(poolId, hash);
    const receipt = await tx.wait();

    const ev = receipt.logs.map((l) => {
      try {
        return poc.interface.parseLog(l);
      } catch (e) {
        return null;
      }
    }).filter(Boolean).find(x => x.name === "ContributionSubmitted");
    expect(ev).to.exist;
    const contributionId = ev.args.contributionId;
    expect(ev.args.contributionHash).to.equal(hash);
    expect(ev.args.contributor).to.equal(contributor.address);

    const contribution = await poc.getContribution(poolId, contributionId);
    expect(contribution.contributionHash).to.equal(hash);
    expect(contribution.contributor).to.equal(contributor.address);
    expect(Number(contribution.state)).to.equal(0);
  });

  it("claimWithAttestation: valid attestation pays out reward", async function () {
    const fund = ethers.parseUnits("100", 18);
    const reward = ethers.parseUnits("25", 18);
    await poc.connect(sponsor).createPool(mockToken.target, fund, reward, 0);
    const poolId = await poc.poolCount();

    const cidString = "commit:abcdef123";
    const hash = canonicalHash(cidString);
    const tx = await poc.connect(contributor).submitContribution(poolId, hash);
    const receipt = await tx.wait();
    const ev = receipt.logs.map((l) => {
      try { return poc.interface.parseLog(l); } catch (e) { return null; }
    }).filter(Boolean).find(x => x.name === "ContributionSubmitted");
    const contributionId = ev.args.contributionId;

    await poc.connect(deployer).setAttestor(attestor.address, true);
    expect(await poc.attestors(attestor.address)).to.equal(true);

    const domain = {
      name: "ProofOfContribution",
      version: "1",
      chainId: chainId,
      verifyingContract: poc.target
    };

    const types = {
      ContributionAttestation: [
        { name: "poolId", type: "uint256" },
        { name: "contributionId", type: "uint256" },
        { name: "contributionHash", type: "bytes32" },
        { name: "contributor", type: "address" },
        { name: "valid", type: "bool" },
        { name: "timestamp", type: "uint256" }
      ]
    };

    const timestamp = Math.floor(Date.now() / 1000);
    const value = {
      poolId: Number(poolId),
      contributionId: Number(contributionId),
      contributionHash: hash,
      contributor: contributor.address,
      valid: true,
      timestamp: timestamp
    };

    const attestorWallet = attestor;
    const signature = await attestorWallet._signTypedData(domain, types, value);

    const beforeBal = await mockToken.balanceOf(contributor.address);

    const claimTx = await poc.connect(contributor).claimWithAttestation(poolId, contributionId, true, timestamp, signature);
    await claimTx.wait();

    const afterBal = await mockToken.balanceOf(contributor.address);
    expect(afterBal - beforeBal).to.equal(reward);

    const pool = await poc.getPool(poolId);
    expect(pool.totalFund).to.equal(fund - reward);

    const contribution = await poc.getContribution(poolId, contributionId);
    expect(Number(contribution.state)).to.equal(2);
    expect(contribution.attestor).to.equal(attestor.address);
  });

  it("double-claim: second claim attempt reverts with AlreadyClaimed", async function () {
    const fund = ethers.parseUnits("100", 18);
    const reward = ethers.parseUnits("25", 18);
    await poc.connect(sponsor).createPool(mockToken.target, fund, reward, 0);
    const poolId = await poc.poolCount();
    const hash = canonicalHash("commit:forDoubleClaim");
    const tx = await poc.connect(contributor).submitContribution(poolId, hash);
    const receipt = await tx.wait();
    const ev = receipt.logs.map((l) => {
      try { return poc.interface.parseLog(l); } catch (e) { return null; }
    }).filter(Boolean).find(x => x.name === "ContributionSubmitted");
    const contributionId = ev.args.contributionId;

    await poc.connect(deployer).setAttestor(attestor.address, true);
    const domain = { name: "ProofOfContribution", version: "1", chainId, verifyingContract: poc.target };
    const types = {
      ContributionAttestation: [
        { name: "poolId", type: "uint256" },
        { name: "contributionId", type: "uint256" },
        { name: "contributionHash", type: "bytes32" },
        { name: "contributor", type: "address" },
        { name: "valid", type: "bool" },
        { name: "timestamp", type: "uint256" }
      ]
    };
    const timestamp = Math.floor(Date.now() / 1000);
    const value = { poolId: Number(poolId), contributionId: Number(contributionId), contributionHash: hash, contributor: contributor.address, valid: true, timestamp };
    const signature = await attestor._signTypedData(domain, types, value);

    await poc.connect(contributor).claimWithAttestation(poolId, contributionId, true, timestamp, signature);

    await expect(poc.connect(contributor).claimWithAttestation(poolId, contributionId, true, timestamp, signature))
      .to.be.revertedWithCustomError(poc, "AlreadyClaimed")
      .withArgs(poolId, contributionId);
  });

  it("wrong-signer: signature from non-attestor reverts with InvalidAttestation", async function () {
    const fund = ethers.parseUnits("100", 18);
    const reward = ethers.parseUnits("10", 18);
    await poc.connect(sponsor).createPool(mockToken.target, fund, reward, 0);
    const poolId = await poc.poolCount();
    const hash = canonicalHash("commit:badSigner");
    const tx = await poc.connect(contributor).submitContribution(poolId, hash);
    const receipt = await tx.wait();
    const ev = receipt.logs.map((l) => {
      try { return poc.interface.parseLog(l); } catch (e) { return null; }
    }).filter(Boolean).find(x => x.name === "ContributionSubmitted");
    const contributionId = ev.args.contributionId;

    const domain = { name: "ProofOfContribution", version: "1", chainId, verifyingContract: poc.target };
    const types = {
      ContributionAttestation: [
        { name: "poolId", type: "uint256" },
        { name: "contributionId", type: "uint256" },
        { name: "contributionHash", type: "bytes32" },
        { name: "contributor", type: "address" },
        { name: "valid", type: "bool" },
        { name: "timestamp", type: "uint256" }
      ]
    };

    const timestamp = Math.floor(Date.now() / 1000);
    const value = { poolId: Number(poolId), contributionId: Number(contributionId), contributionHash: hash, contributor: contributor.address, valid: true, timestamp };
    const sigByOther = await other._signTypedData(domain, types, value);

    await expect(poc.connect(contributor).claimWithAttestation(poolId, contributionId, true, timestamp, sigByOther))
      .to.be.revertedWithCustomError(poc, "InvalidAttestation");
  });

  it("expired-pool: cannot submit after expiry and cannot claim after expiry", async function () {
    const fund = ethers.parseUnits("50", 18);
    const reward = ethers.parseUnits("10", 18);
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + 5;
    await poc.connect(sponsor).createPool(mockToken.target, fund, reward, expiresAt);
    const poolId = await poc.poolCount();

    await ethers.provider.send("evm_increaseTime", [10]);
    await ethers.provider.send("evm_mine", []);

    const hash = canonicalHash("commit:afterExpiry");
    await expect(poc.connect(contributor).submitContribution(poolId, hash))
      .to.be.revertedWithCustomError(poc, "PoolClosedOrExpired");

    const expiresAt2 = Math.floor(Date.now() / 1000) + 20;
    await poc.connect(sponsor).createPool(mockToken.target, fund, reward, expiresAt2);
    const poolId2 = await poc.poolCount();
    const hash2 = canonicalHash("commit:willExpire");
    const tx2 = await poc.connect(contributor).submitContribution(poolId2, hash2);
    const r2 = await tx2.wait();
    const ev2 = r2.logs.map((l) => { try { return poc.interface.parseLog(l); } catch (e) { return null } }).filter(Boolean).find(x => x.name === "ContributionSubmitted");
    const contributionId2 = ev2.args.contributionId;

    await poc.connect(deployer).setAttestor(attestor.address, true);
    const domain = { name: "ProofOfContribution", version: "1", chainId, verifyingContract: poc.target };
    const types = {
      ContributionAttestation: [
        { name: "poolId", type: "uint256" },
        { name: "contributionId", type: "uint256" },
        { name: "contributionHash", type: "bytes32" },
        { name: "contributor", type: "address" },
        { name: "valid", type: "bool" },
        { name: "timestamp", type: "uint256" }
      ]
    };
    const timestamp = Math.floor(Date.now() / 1000);
    const value = { poolId: Number(poolId2), contributionId: Number(contributionId2), contributionHash: hash2, contributor: contributor.address, valid: true, timestamp };
    const signature = await attestor._signTypedData(domain, types, value);

    await ethers.provider.send("evm_increaseTime", [30]);
    await ethers.provider.send("evm_mine", []);

    await expect(poc.connect(contributor).claimWithAttestation(poolId2, contributionId2, true, timestamp, signature))
      .to.be.revertedWith("withdraw not allowed while pool active")
      .or.to.be.revertedWithCustomError(poc, "PoolClosedOrExpired");
  });
});

