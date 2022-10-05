const {network, ethers} = require("hardhat");
const {developmentChains, networkConfig, VERIFICATION_BLOCK_CONFIRMATIONS} = require("../helper-hardhat-config");
const {verify} = require("../utils/verify")

const VRF_SUB_FUND_AMOUNT = ethers.utils.parseEther("5")

module.exports = async function({getNamedAccounts, deployments}) {
    const {deploy, log} = deployments
    const {deployer} = await getNamedAccounts()
    const chainId = network.config.chainId
    let vrfCoordinatorV2Address, subscriptionId, vrfCoordinatorV2Mock

    if (chainId == 31337) {
        vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock")
        vrfCoordinatorV2Address = vrfCoordinatorV2Mock.address
        const transactionResponse = await vrfCoordinatorV2Mock.createSubscription()
        const transactionReceipt = await transactionResponse.wait()
        subscriptionId = transactionReceipt.events[0].args.subId

        await vrfCoordinatorV2Mock.fundSubscription(subscriptionId, VRF_SUB_FUND_AMOUNT)
    } else {
        vrfCoordinatorV2Address = networkConfig[chainId]["vrfCoordinatorV2"]
        subscriptionId = networkConfig[chainId]["subscriptionId"]
    }
    const waitBlockConfirmations = developmentChains.includes(network.name)
        ? 1
        : VERIFICATION_BLOCK_CONFIRMATIONS

    const gasLane = networkConfig[chainId]["gasLane"]
    const minimumBet = networkConfig[chainId]["minimumBet"]
    const callbackGasLimit = networkConfig[chainId]["callbackGasLimit"]

    const args = [vrfCoordinatorV2Address, subscriptionId, gasLane, minimumBet, callbackGasLimit]

    const crash = await deploy("Crash", {
        from: deployer,
        args: args,
        log: true,
        waitConfirmations: waitBlockConfirmations,
    })

    if (chainId == 31337) {
        await vrfCoordinatorV2Mock.addConsumer(subscriptionId, crash.address);

        log('Consumer is added');
    }

    if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
        log("Verifying Address")
        await verify(crash.address, args)
    }
    log("--------------------------------------")
}

module.exports.tags = ["all", "crash"]