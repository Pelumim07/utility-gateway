const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  if (!deployer) {
    throw new Error(
      "No deployer account found. Did you set PRIVATE_KEY in your .env file?"
    );
  }

  console.log("Deploying with account:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Deployer MON balance:", hre.ethers.formatEther(balance));

  const operatorAddress = process.env.OPERATOR_ADDRESS || deployer.address;
  console.log("Operator wallet set to:", operatorAddress);

  const UtilityGateway = await hre.ethers.getContractFactory("UtilityGateway");
  const gateway = await UtilityGateway.deploy(operatorAddress);
  await gateway.waitForDeployment();

  const address = await gateway.getAddress();
  console.log("\n✅ UtilityGateway deployed!");
  console.log("Contract address:", address);
  console.log("Explorer link:  https://testnet.monadexplorer.com/address/" + address);
  console.log(
    "\nNext: copy this address into backend/.env as CONTRACT_ADDRESS"
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
