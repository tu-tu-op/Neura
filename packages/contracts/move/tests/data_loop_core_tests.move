#[test_only]
module neura::data_loop_core_tests {
    use std::string;
    use neura::data_loop_core::{Self, AdminCap, CoreConfig, CoreRegistry};
    use neura::data_loop_core::{Correction, CorrectionSubmitted, Stake, StakeDeposited};
    use neura::data_loop_core::{Task, TaskCreated};
    use sui::coin;
    use sui::event;
    use sui::sui::SUI;
    use sui::test_scenario;

    const ADMIN: address = @0xA11CE;
    const USER: address = @0xB0B;
    const TASK_ID: vector<u8> = b"task-1";
    const STAKE_AMOUNT: u64 = 1_000_000;

    #[test]
    fun test_init() {
        let mut scenario = test_scenario::begin(ADMIN);
        data_loop_core::init_for_testing(scenario.ctx());

        scenario.next_tx(ADMIN);
        let cap = scenario.take_from_sender<AdminCap>();
        let config = scenario.take_shared<CoreConfig>();
        let registry = scenario.take_shared<CoreRegistry>();

        assert!(data_loop_core::minimum_stake_lock_epochs(&config) == 7);
        assert!(data_loop_core::next_correction_id(&registry) == 0);
        assert!(data_loop_core::next_stake_id(&registry) == 0);

        scenario.return_to_sender(cap);
        test_scenario::return_shared(config);
        test_scenario::return_shared(registry);
        scenario.end();
    }

    #[test]
    fun test_create_task() {
        let mut scenario = test_scenario::begin(ADMIN);
        data_loop_core::init_for_testing(scenario.ctx());

        scenario.next_tx(USER);
        let config = scenario.take_shared<CoreConfig>();
        let mut registry = scenario.take_shared<CoreRegistry>();
        data_loop_core::create_task(
            TASK_ID,
            string::utf8(b"walrus://task-metadata"),
            b"task-hash",
            option::none(),
            &mut registry,
            &config,
            scenario.ctx(),
        );
        assert!(data_loop_core::task_exists(&registry, TASK_ID));

        let events = event::events_by_type<TaskCreated>();
        assert!(events.length() == 1);
        assert!(*data_loop_core::task_created_task_id(&events[0]) == TASK_ID);
        assert!(option::is_none(data_loop_core::task_created_stake_id(&events[0])));

        test_scenario::return_shared(config);
        test_scenario::return_shared(registry);

        scenario.next_tx(USER);
        let task = scenario.take_shared<Task>();
        assert!(*data_loop_core::task_id(&task) == TASK_ID);
        assert!(data_loop_core::task_creator(&task) == USER);
        test_scenario::return_shared(task);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = 1, location = data_loop_core)]
    fun test_create_task_duplicate_aborts() {
        let mut scenario = test_scenario::begin(ADMIN);
        data_loop_core::init_for_testing(scenario.ctx());

        scenario.next_tx(USER);
        let config = scenario.take_shared<CoreConfig>();
        let mut registry = scenario.take_shared<CoreRegistry>();
        data_loop_core::create_task(
            TASK_ID,
            string::utf8(b"walrus://task-metadata"),
            b"task-hash",
            option::none(),
            &mut registry,
            &config,
            scenario.ctx(),
        );
        test_scenario::return_shared(config);
        test_scenario::return_shared(registry);

        scenario.next_tx(USER);
        let config = scenario.take_shared<CoreConfig>();
        let mut registry = scenario.take_shared<CoreRegistry>();
        data_loop_core::create_task(
            TASK_ID,
            string::utf8(b"walrus://duplicate"),
            b"duplicate-hash",
            option::none(),
            &mut registry,
            &config,
            scenario.ctx(),
        );
        abort 0
    }

    #[test]
    fun test_submit_correction() {
        let mut scenario = test_scenario::begin(ADMIN);
        data_loop_core::init_for_testing(scenario.ctx());

        scenario.next_tx(USER);
        let config = scenario.take_shared<CoreConfig>();
        let mut registry = scenario.take_shared<CoreRegistry>();
        data_loop_core::create_task(
            TASK_ID,
            string::utf8(b"walrus://task-metadata"),
            b"task-hash",
            option::none(),
            &mut registry,
            &config,
            scenario.ctx(),
        );
        test_scenario::return_shared(config);
        test_scenario::return_shared(registry);

        scenario.next_tx(USER);
        let config = scenario.take_shared<CoreConfig>();
        let mut registry = scenario.take_shared<CoreRegistry>();
        data_loop_core::submit_correction(
            TASK_ID,
            string::utf8(b"walrus://correction-metadata"),
            b"correction-hash",
            option::none(),
            &mut registry,
            &config,
            scenario.ctx(),
        );
        assert!(data_loop_core::next_correction_id(&registry) == 1);
        assert!(data_loop_core::correction_exists(&registry, 0));

        let events = event::events_by_type<CorrectionSubmitted>();
        assert!(events.length() == 1);
        assert!(data_loop_core::correction_submitted_id(&events[0]) == 0);

        test_scenario::return_shared(config);
        test_scenario::return_shared(registry);

        scenario.next_tx(USER);
        let correction = scenario.take_shared<Correction>();
        assert!(data_loop_core::correction_id(&correction) == 0);
        assert!(*data_loop_core::correction_task_id(&correction) == TASK_ID);
        test_scenario::return_shared(correction);
        scenario.end();
    }

    #[test]
    fun test_deposit_stake_and_release_after_lock() {
        let mut scenario = test_scenario::begin(ADMIN);
        data_loop_core::init_for_testing(scenario.ctx());

        scenario.next_tx(USER);
        let config = scenario.take_shared<CoreConfig>();
        let mut registry = scenario.take_shared<CoreRegistry>();
        data_loop_core::create_task(
            TASK_ID,
            string::utf8(b"walrus://task-metadata"),
            b"task-hash",
            option::none(),
            &mut registry,
            &config,
            scenario.ctx(),
        );
        test_scenario::return_shared(config);
        test_scenario::return_shared(registry);

        scenario.next_tx(USER);
        let config = scenario.take_shared<CoreConfig>();
        let mut registry = scenario.take_shared<CoreRegistry>();
        let coin = coin::mint_for_testing<SUI>(STAKE_AMOUNT, scenario.ctx());
        data_loop_core::deposit_stake_for_task(
            TASK_ID,
            coin,
            &mut registry,
            &config,
            scenario.ctx(),
        );
        assert!(data_loop_core::next_stake_id(&registry) == 1);
        let events = event::events_by_type<StakeDeposited>();
        assert!(events.length() == 1);
        test_scenario::return_shared(config);
        test_scenario::return_shared(registry);

        scenario.skip_to_epoch(7);
        let config = scenario.take_shared<CoreConfig>();
        let stake = scenario.take_shared<Stake>();
        assert!(data_loop_core::stake_id(&stake) == 0);
        assert!(data_loop_core::stake_amount(&stake) == STAKE_AMOUNT);
        assert!(data_loop_core::stake_unlock_epoch(&stake) == 7);
        let released = data_loop_core::release_stake(stake, &config, scenario.ctx());
        assert!(coin::burn_for_testing(released) == STAKE_AMOUNT);
        test_scenario::return_shared(config);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = 4, location = data_loop_core)]
    fun test_release_stake_before_lock_aborts() {
        let mut scenario = test_scenario::begin(ADMIN);
        data_loop_core::init_for_testing(scenario.ctx());

        scenario.next_tx(USER);
        let config = scenario.take_shared<CoreConfig>();
        let mut registry = scenario.take_shared<CoreRegistry>();
        data_loop_core::create_task(
            TASK_ID,
            string::utf8(b"walrus://task-metadata"),
            b"task-hash",
            option::none(),
            &mut registry,
            &config,
            scenario.ctx(),
        );
        let coin = coin::mint_for_testing<SUI>(STAKE_AMOUNT, scenario.ctx());
        data_loop_core::deposit_stake_for_task(
            TASK_ID,
            coin,
            &mut registry,
            &config,
            scenario.ctx(),
        );
        test_scenario::return_shared(config);
        test_scenario::return_shared(registry);

        scenario.next_tx(USER);
        let config = scenario.take_shared<CoreConfig>();
        let stake = scenario.take_shared<Stake>();
        let released = data_loop_core::release_stake(stake, &config, scenario.ctx());
        coin::burn_for_testing(released);
        abort 0
    }

    #[test]
    #[expected_failure(abort_code = 3, location = sui::test_scenario)]
    fun test_register_dataset_version_requires_cap() {
        let mut scenario = test_scenario::begin(ADMIN);
        data_loop_core::init_for_testing(scenario.ctx());

        scenario.next_tx(USER);
        // The capability is owned by ADMIN, so USER cannot obtain the required argument.
        let cap = scenario.take_from_sender<AdminCap>();
        data_loop_core::register_dataset_version(
            &cap,
            b"dataset-1",
            string::utf8(b"walrus://dataset-metadata"),
            b"dataset-hash",
            scenario.ctx(),
        );
        scenario.return_to_sender(cap);
        scenario.end();
    }
}
