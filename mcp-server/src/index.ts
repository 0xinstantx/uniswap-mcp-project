/**
 * Uniswap MCP Server
 * 
 * This MCP server interacts with a local Ethereum fork to check ETH balances and perform ETH-USDC swaps on UniV3
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createPublicClient, createWalletClient, http, formatUnits, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";


// Define a custom chain for the local fork
const localFork = {
    ...mainnet,
    id: 31337,
    rpcUrls: {
        default: {
            http: ["http://localhost:8545"],
        },
    },
};


// Create public client for reading chain data
const publicClient = createPublicClient({
    chain: localFork,
    transport: http(),
});

// Create wallet client for sending transactions
const walletClient = createWalletClient({
    chain: localFork,
    transport: http(),
    account: privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"), // Anvil default account private key
});

const swapRouterAbi = [
    {
        inputs: [
            {
                components: [
                    { name: "tokenIn", type: "address" },
                    { name: "tokenOut", type: "address" },
                    { name: "fee", type: "uint256" },
                    { name: "recipient", type: "address" },
                    { name: "deadline", type: "uint256" },
                    { name: "amountIn", type: "uint256" },
                    { name: "amountOutMinimum", type: "uint256" },
                    { name: "sqrtPriceLimitX96", type: "uint256" },
                ],
                name: "exactInputSingle",
                type: "tuple",
            },
        ],
        name: "exactInputSingle",
        outputs: [{ name: "amountOut", type: "uint256" }],
        stateMutability: "payable",
        type: "function",
    },
] as const;

// WETH ABI (minimal)
const wethAbi = [
    { inputs: [], name: "deposit", outputs: [], stateMutability: "payable", type: "function" },
    { inputs: [{ name: "spender", type: "address" }, {name: "amount", type: "uint256"}], name: "approve", outputs: [{ name: "", type: "bool" }], stateMutability: "nonpayable", type: "function"},
] as const;

// Initialize the MCP server
const server = new McpServer({
    name: "uniswap-local-fork",
    version: "0.0.1",
    capabilities: ["get_eth_balance", "swap_eth_for_usdc"],
});

// Tool 1: get ETH balance
server.tool(
    "get_eth_balance",
    "Get ETH balance for an address on the local Ethereum fork",
    {
        address: z.string().describe("Ethereum address to check balance for"),
    },
    async ({ address }) => {
        try {
            const balance = await publicClient.getBalance({
                address: address as `0x${string}`,
            });
            return {
                content: [
                    {
                        type: "text",
                        text: `Balance for ${address}: ${formatUnits(balance, 18)} ETH`
                    },
                ],
            };
        } catch (error) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Failed to retrieve balance for address: ${address}. Error: ${
                            error instanceof Error ? error.message : String(error)
                        }`,
                    }
                ]
            };
        }
    }
);

// Tool 2: Swap ETH for USDC
server.tool(
    "swap_eth_for_usdc",
    "Swap ETH for USDC using UniV3 on the local fork",
    {
        recipient: z.string().describe("Address to receive USDC"),
        amountIn: z.string().describe("Amount of ETH to swap"),
    },
    async ({ recipient, amountEth }) => {
        try {
            // Parse ETH amount
            const amountIn = parseEther(amountEth);

            // Step 1: Wrap ETH to WETH
            const depositTx = await walletClient.writeContract({
                address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH address on mainnet
                abi: wethAbi,
                functionName: "deposit",
                value: amountIn,
            });
            await publicClient.waitForTransactionReceipt({ hash: depositTx });

            // Step 2: Approve SwapRouter to spend WETH
            const approveTx = await walletClient.writeContract({
                address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
                abi: wethAbi,
                functionName: "approve",
                args: ["0xE592427A0AEce92De3Edee1F18E0157C05861564", amountIn], // SwapRouter address on mainnet
            });
            await publicClient.waitForTransactionReceipt({ hash: approveTx });

            // Step 3: Swap ETH for USDC
            const swapTx = await walletClient.writeContract({
                address: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
                abi: swapRouterAbi,
                functionName: "exactInputSingle",
                args: [{
                    tokenIn: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
                    tokenOut: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                    fee: BigInt(3000),
                    recipient: recipient as `0x${string}`,
                    deadline: BigInt(Math.floor(Date.now() / 1000) + 1000),
                    amountIn,
                    amountOutMinimum: BigInt(0),
                    sqrtPriceLimitX96: BigInt(0),
                }],
            });
            const receipt = await publicClient.waitForTransactionReceipt({ hash: swapTx });

            const usdcBalance = await publicClient.readContract({
                address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                abi: [{ inputs: [{ name: "account", type: "address" }], name: "balanceOf", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function"}],
                functionName: "balanceOf",
                args: [recipient as `0x${string}`],
            });

            return {
                content: [
                    {
                        type: "text",
                        text: `Successfully swapped ${amountEth} ETH for ${formatUnits(usdcBalance, 6)} USDC. Transaction hash: ${swapTx}`,
                    },
                ],
            };
        } catch (error) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Failed to swap ETH for USDC. Error: ${
                            error instanceof Error ? error.message : String(error)
                        }`,
                    },
                ],
            };
        }
    }
);

// Start the server
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Uniswap MCP Server running on stdio");
}

main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
})