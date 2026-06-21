module neura::data_loop_core {
    use std::string::{Self, String};
    use sui::balance::{Self, Balance};
    use sui::bcs;
    use sui::coin::{Self, Coin};
    use sui::event;
    use sui::sui::SUI;
    use sui::table::{Self, Table};

    const E_TASK_ALREADY_EXISTS: u64 = 1;
    const E_TASK_NOT_FOUND: u64 = 2;
    const E_CORRECTION_NOT_FOUND: u64 = 3;
    const E_STAKE_LOCKED: u64 = 4;
    const E_NOT_STAKER: u64 = 5;

    const TARGET_TASK: u8 = 0;
    const TARGET_CORRECTION: u8 = 1;
    const DEFAULT_MINIMUM_STAKE_LOCK_EPOCHS: u64 = 7;

    public struct AdminCap has key, store {
        id: UID,
    }

    public struct CoreConfig has key {
        id: UID,
        minimum_stake_lock_epochs: u64,
    }

    public struct CoreRegistry has key {
        id: UID,
        next_correction_id: u64,
        next_stake_id: u64,
        task_exists: Table<vector<u8>, bool>,
        correction_exists: Table<u64, bool>,
    }

    public struct Task has key, store {
        id: UID,
        task_id: vector<u8>,
        creator: address,
        metadata_uri: String,
        metadata_hash: vector<u8>,
        created_at_epoch: u64,
    }

    public struct Correction has key, store {
        id: UID,
        correction_id: u64,
        task_id: vector<u8>,
        submitter: address,
        metadata_uri: String,
        metadata_hash: vector<u8>,
        created_at_epoch: u64,
    }

    public struct DatasetVersion has key, store {
        id: UID,
        dataset_id: vector<u8>,
        metadata_uri: String,
        metadata_hash: vector<u8>,
        registered_by: address,
        registered_at_epoch: u64,
    }

    public struct Stake has key, store {
        id: UID,
        stake_id: u64,
        staker: address,
        target_type: u8,
        target_id: vector<u8>,
        balance: Balance<SUI>,
        unlock_epoch: u64,
    }

    public struct TaskCreated has copy, drop {
        task_id: vector<u8>,
        creator: address,
        metadata_uri: String,
        stake_id: Option<u64>,
    }

    public struct CorrectionSubmitted has copy, drop {
        correction_id: u64,
        task_id: vector<u8>,
        submitter: address,
        metadata_uri: String,
    }

    public struct DatasetRegistered has copy, drop {
        dataset_id: vector<u8>,
        metadata_uri: String,
        registered_by: address,
    }

    public struct StakeDeposited has copy, drop {
        stake_id: u64,
        target_type: String,
        target_id: vector<u8>,
        target_id_u64: u64,
        staker: address,
        amount: u64,
    }

    public struct StakeReleased has copy, drop {
        stake_id: u64,
        released_to: address,
        amount: u64,
    }

    fun init(ctx: &mut TxContext) {
        transfer::transfer(
            AdminCap { id: object::new(ctx) },
            tx_context::sender(ctx),
        );
        transfer::share_object(CoreConfig {
            id: object::new(ctx),
            minimum_stake_lock_epochs: DEFAULT_MINIMUM_STAKE_LOCK_EPOCHS,
        });
        transfer::share_object(CoreRegistry {
            id: object::new(ctx),
            next_correction_id: 0,
            next_stake_id: 0,
            task_exists: table::new(ctx),
            correction_exists: table::new(ctx),
        });
    }

    public fun create_task(
        task_id: vector<u8>,
        metadata_uri: String,
        metadata_hash: vector<u8>,
        mut stake: Option<Coin<SUI>>,
        registry: &mut CoreRegistry,
        config: &CoreConfig,
        ctx: &mut TxContext,
    ) {
        assert!(!table::contains(&registry.task_exists, task_id), E_TASK_ALREADY_EXISTS);

        let creator = tx_context::sender(ctx);
        table::add(&mut registry.task_exists, task_id, true);
        transfer::share_object(Task {
            id: object::new(ctx),
            task_id,
            creator,
            metadata_uri,
            metadata_hash,
            created_at_epoch: tx_context::epoch(ctx),
        });

        let stake_id = if (option::is_some(&stake)) {
            let coin = option::extract(&mut stake);
            option::some(create_stake(
                registry,
                config,
                creator,
                TARGET_TASK,
                task_id,
                0,
                coin,
                ctx,
            ))
        } else {
            option::none()
        };
        option::destroy_none(stake);

        event::emit(TaskCreated {
            task_id,
            creator,
            metadata_uri,
            stake_id,
        });
    }

    public fun submit_correction(
        task_id: vector<u8>,
        metadata_uri: String,
        metadata_hash: vector<u8>,
        mut stake: Option<Coin<SUI>>,
        registry: &mut CoreRegistry,
        config: &CoreConfig,
        ctx: &mut TxContext,
    ) {
        assert!(table::contains(&registry.task_exists, task_id), E_TASK_NOT_FOUND);

        let correction_id = registry.next_correction_id;
        registry.next_correction_id = correction_id + 1;
        table::add(&mut registry.correction_exists, correction_id, true);

        let submitter = tx_context::sender(ctx);
        transfer::share_object(Correction {
            id: object::new(ctx),
            correction_id,
            task_id,
            submitter,
            metadata_uri,
            metadata_hash,
            created_at_epoch: tx_context::epoch(ctx),
        });

        if (option::is_some(&stake)) {
            let coin = option::extract(&mut stake);
            create_stake(
                registry,
                config,
                submitter,
                TARGET_CORRECTION,
                bcs::to_bytes(&correction_id),
                correction_id,
                coin,
                ctx,
            );
        };
        option::destroy_none(stake);

        event::emit(CorrectionSubmitted {
            correction_id,
            task_id,
            submitter,
            metadata_uri,
        });
    }

    public fun deposit_stake_for_task(
        task_id: vector<u8>,
        coin: Coin<SUI>,
        registry: &mut CoreRegistry,
        config: &CoreConfig,
        ctx: &mut TxContext,
    ) {
        assert!(table::contains(&registry.task_exists, task_id), E_TASK_NOT_FOUND);
        create_stake(
            registry,
            config,
            tx_context::sender(ctx),
            TARGET_TASK,
            task_id,
            0,
            coin,
            ctx,
        );
    }

    public fun deposit_stake_for_correction(
        correction_id: u64,
        coin: Coin<SUI>,
        registry: &mut CoreRegistry,
        config: &CoreConfig,
        ctx: &mut TxContext,
    ) {
        assert!(
            table::contains(&registry.correction_exists, correction_id),
            E_CORRECTION_NOT_FOUND,
        );
        create_stake(
            registry,
            config,
            tx_context::sender(ctx),
            TARGET_CORRECTION,
            bcs::to_bytes(&correction_id),
            correction_id,
            coin,
            ctx,
        );
    }

    public fun register_dataset_version(
        _cap: &AdminCap,
        dataset_id: vector<u8>,
        metadata_uri: String,
        metadata_hash: vector<u8>,
        ctx: &mut TxContext,
    ) {
        let registered_by = tx_context::sender(ctx);
        transfer::share_object(DatasetVersion {
            id: object::new(ctx),
            dataset_id,
            metadata_uri,
            metadata_hash,
            registered_by,
            registered_at_epoch: tx_context::epoch(ctx),
        });
        event::emit(DatasetRegistered {
            dataset_id,
            metadata_uri,
            registered_by,
        });
    }

    public fun release_stake(
        stake: Stake,
        _config: &CoreConfig,
        ctx: &mut TxContext,
    ): Coin<SUI> {
        let sender = tx_context::sender(ctx);
        assert!(sender == stake.staker, E_NOT_STAKER);
        assert!(tx_context::epoch(ctx) >= stake.unlock_epoch, E_STAKE_LOCKED);
        release_stake_inner(stake, sender, ctx)
    }

    public fun release_stake_as_admin(
        _cap: &AdminCap,
        stake: Stake,
        _config: &CoreConfig,
        ctx: &mut TxContext,
    ): Coin<SUI> {
        release_stake_inner(stake, tx_context::sender(ctx), ctx)
    }

    fun create_stake(
        registry: &mut CoreRegistry,
        config: &CoreConfig,
        staker: address,
        target_type: u8,
        target_id: vector<u8>,
        target_id_u64: u64,
        coin: Coin<SUI>,
        ctx: &mut TxContext,
    ): u64 {
        let stake_id = registry.next_stake_id;
        registry.next_stake_id = stake_id + 1;
        let amount = coin::value(&coin);

        transfer::share_object(Stake {
            id: object::new(ctx),
            stake_id,
            staker,
            target_type,
            target_id,
            balance: coin::into_balance(coin),
            unlock_epoch: tx_context::epoch(ctx) + config.minimum_stake_lock_epochs,
        });
        event::emit(StakeDeposited {
            stake_id,
            target_type: if (target_type == TARGET_TASK) {
                string::utf8(b"task")
            } else {
                string::utf8(b"correction")
            },
            target_id,
            target_id_u64,
            staker,
            amount,
        });
        stake_id
    }

    fun release_stake_inner(
        stake: Stake,
        released_to: address,
        ctx: &mut TxContext,
    ): Coin<SUI> {
        let Stake {
            id,
            stake_id,
            staker: _,
            target_type: _,
            target_id: _,
            balance,
            unlock_epoch: _,
        } = stake;
        let amount = balance::value(&balance);
        object::delete(id);
        event::emit(StakeReleased { stake_id, released_to, amount });
        coin::from_balance(balance, ctx)
    }

    public fun minimum_stake_lock_epochs(config: &CoreConfig): u64 {
        config.minimum_stake_lock_epochs
    }

    public fun next_correction_id(registry: &CoreRegistry): u64 {
        registry.next_correction_id
    }

    public fun next_stake_id(registry: &CoreRegistry): u64 {
        registry.next_stake_id
    }

    public fun task_exists(registry: &CoreRegistry, task_id: vector<u8>): bool {
        table::contains(&registry.task_exists, task_id)
    }

    public fun correction_exists(registry: &CoreRegistry, correction_id: u64): bool {
        table::contains(&registry.correction_exists, correction_id)
    }

    public fun task_id(task: &Task): &vector<u8> {
        &task.task_id
    }

    public fun task_creator(task: &Task): address {
        task.creator
    }

    public fun correction_id(correction: &Correction): u64 {
        correction.correction_id
    }

    public fun correction_task_id(correction: &Correction): &vector<u8> {
        &correction.task_id
    }

    public fun stake_id(stake: &Stake): u64 {
        stake.stake_id
    }

    public fun stake_amount(stake: &Stake): u64 {
        balance::value(&stake.balance)
    }

    public fun stake_unlock_epoch(stake: &Stake): u64 {
        stake.unlock_epoch
    }

    public fun task_created_task_id(created: &TaskCreated): &vector<u8> {
        &created.task_id
    }

    public fun task_created_stake_id(created: &TaskCreated): &Option<u64> {
        &created.stake_id
    }

    public fun correction_submitted_id(submitted: &CorrectionSubmitted): u64 {
        submitted.correction_id
    }

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx)
    }
}
