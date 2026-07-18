// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title UtilityGateway
/// @notice Pay MON, get real Nigerian utility services delivered: airtime,
///         data bundles, electricity tokens, or cable TV subscriptions.
///         Every purchase is logged onchain as a verifiable order. An
///         off-chain "operator" (your backend service) watches for
///         PaymentReceived events, calls the relevant VTpass API, and
///         reports the result back onchain via markFulfilled / markFailed.
///         Failed orders can be refunded by the buyer directly - no admin
///         intervention needed.
/// @dev No external imports (no OpenZeppelin) so this compiles standalone
///      with just solc.
///
/// NOTE ON SCOPE: this contract intentionally does NOT include a MON <-> NGN
/// exchange/cash-out feature. That is a fundamentally different problem
/// (liquidity + a real payout rail, not a VTU-style API call) and doesn't
/// make sense to demo on testnet MON, which has no real value. See the
/// project README for the full reasoning.
contract UtilityGateway {
    enum Status {
        Pending,
        Fulfilled,
        Failed,
        Refunded
    }

    /// @dev serviceType examples: "AIRTIME", "DATA", "ELECTRICITY", "CABLE_TV"
    /// @dev provider examples: "MTN", "IKEDC", "DSTV", "GOTV"
    /// @dev productCode meaning depends on serviceType:
    ///        AIRTIME     -> naira amount, e.g. "200"
    ///        DATA        -> VTpass variation_code, e.g. "mtn-1gb-30days"
    ///        ELECTRICITY -> "PREPAID:<naira amount>" or "POSTPAID:<naira amount>"
    ///        CABLE_TV    -> VTpass variation_code, e.g. "dstv-padi"
    struct Order {
        address buyer;
        bytes32 accountHash; // keccak256(accountId:salt) - phone/meter/smartcard stays off-chain
        string  serviceType;
        string  provider;
        string  productCode;
        uint256 amount; // MON paid, in wei
        uint256 timestamp;
        Status  status;
    }

    address public owner;
    address public operator;

    uint256 public nextOrderId = 1;
    uint256 public withdrawableBalance; // MON owed to owner from fulfilled orders

    mapping(uint256 => Order) public orders;
    mapping(address => uint256[]) public ordersByBuyer;

    event PaymentReceived(
        uint256 indexed orderId,
        address indexed buyer,
        bytes32 accountHash,
        string serviceType,
        string provider,
        string productCode,
        uint256 amount,
        uint256 timestamp
    );
    event OrderFulfilled(uint256 indexed orderId, uint256 timestamp);
    event OrderFailed(uint256 indexed orderId, string reason, uint256 timestamp);
    event OrderRefunded(uint256 indexed orderId, uint256 amount, uint256 timestamp);
    event OperatorUpdated(address indexed oldOperator, address indexed newOperator);

    modifier onlyOwner() {
        require(msg.sender == owner, "UtilityGateway: not owner");
        _;
    }

    modifier onlyOperator() {
        require(msg.sender == operator, "UtilityGateway: not operator");
        _;
    }

    constructor(address _operator) {
        require(_operator != address(0), "UtilityGateway: zero operator");
        owner = msg.sender;
        operator = _operator;
    }

    /// @notice Buy a utility service. Send MON as msg.value.
    function purchaseService(
        bytes32 accountHash,
        string calldata serviceType,
        string calldata provider,
        string calldata productCode
    ) external payable returns (uint256 orderId) {
        require(msg.value > 0, "UtilityGateway: no MON sent");

        orderId = nextOrderId++;
        orders[orderId] = Order({
            buyer: msg.sender,
            accountHash: accountHash,
            serviceType: serviceType,
            provider: provider,
            productCode: productCode,
            amount: msg.value,
            timestamp: block.timestamp,
            status: Status.Pending
        });
        ordersByBuyer[msg.sender].push(orderId);

        emit PaymentReceived(
            orderId,
            msg.sender,
            accountHash,
            serviceType,
            provider,
            productCode,
            msg.value,
            block.timestamp
        );
    }

    /// @notice Backend calls this once the VTpass API confirms delivery.
    function markFulfilled(uint256 orderId) external onlyOperator {
        Order storage o = orders[orderId];
        require(o.buyer != address(0), "UtilityGateway: unknown order");
        require(o.status == Status.Pending, "UtilityGateway: not pending");

        o.status = Status.Fulfilled;
        withdrawableBalance += o.amount;

        emit OrderFulfilled(orderId, block.timestamp);
    }

    /// @notice Backend calls this if the VTpass API call fails. Funds stay
    ///         locked in the contract so the buyer can claim them back.
    function markFailed(uint256 orderId, string calldata reason) external onlyOperator {
        Order storage o = orders[orderId];
        require(o.buyer != address(0), "UtilityGateway: unknown order");
        require(o.status == Status.Pending, "UtilityGateway: not pending");

        o.status = Status.Failed;

        emit OrderFailed(orderId, reason, block.timestamp);
    }

    /// @notice Buyer pulls their MON back after a failed order.
    function claimRefund(uint256 orderId) external {
        Order storage o = orders[orderId];
        require(o.buyer == msg.sender, "UtilityGateway: not your order");
        require(o.status == Status.Failed, "UtilityGateway: not refundable");

        o.status = Status.Refunded;
        uint256 amount = o.amount;

        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "UtilityGateway: refund transfer failed");

        emit OrderRefunded(orderId, amount, block.timestamp);
    }

    /// @notice Owner withdraws MON collected from fulfilled orders only.
    function withdraw() external onlyOwner {
        uint256 amount = withdrawableBalance;
        require(amount > 0, "UtilityGateway: nothing to withdraw");
        withdrawableBalance = 0;

        (bool ok, ) = payable(owner).call{value: amount}("");
        require(ok, "UtilityGateway: withdraw transfer failed");
    }

    function setOperator(address _operator) external onlyOwner {
        require(_operator != address(0), "UtilityGateway: zero operator");
        emit OperatorUpdated(operator, _operator);
        operator = _operator;
    }

    function getOrder(uint256 orderId) external view returns (Order memory) {
        return orders[orderId];
    }

    function getOrdersByBuyer(address buyer) external view returns (uint256[] memory) {
        return ordersByBuyer[buyer];
    }

    function totalOrders() external view returns (uint256) {
        return nextOrderId - 1;
    }
}
