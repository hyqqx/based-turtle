// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title TurtleActions
/// @notice Tiny action hub for Based Turtle. Each function does almost nothing
///         on purpose: it just emits an event. Two reasons this contract exists:
///
///         1. The CDP Paymaster sponsors gas per *contract + function selector*.
///            A self-transfer to the player's own wallet has no fixed address to
///            allowlist, so it can't be sponsored. A fixed contract with named
///            functions (gm / feed / wash / swim) can.
///
///         2. The ERC-8021 builder-code suffix still rides along at the end of
///            the calldata, so attribution to play.basedturtle.com keeps working.
///
///         The emitted Action(player, selector) event is what the server reads to
///         confirm who did what — because a paymaster-sponsored (ERC-4337) call is
///         bundled, so the onchain `tx.from` is the bundler, NOT the player.
///
/// ⚠️  Do not deploy + switch the app to this yet. The frontend (page.tsx),
///     lib/onchain.ts and the server check (lib/verifyTx.ts) all have to change
///     together, and they need this contract's deployed address first.
contract TurtleActions {
    event Action(address indexed player, bytes4 indexed selector);

    function gm() external {
        emit Action(msg.sender, msg.sig);
    }

    function feed() external {
        emit Action(msg.sender, msg.sig);
    }

    function wash() external {
        emit Action(msg.sender, msg.sig);
    }

    function swim() external {
        emit Action(msg.sender, msg.sig);
    }
}
