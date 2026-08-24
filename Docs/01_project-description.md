# Project 3 - Rail and Road-based Supply Chain Distribution System

Kandypack is a mid-sized FMCG manufacturing company located in Kandy, Sri Lanka. The company distributes finished goods to wholesale and retail customers across the island using a combination of railway transport and road-based last-mile delivery. The company has maintained Excel-based tracking systems for years, but due to increasing order volumes and delivery inefficiencies, the management has decided to implement a modern, database-driven logistics platform. Your team is hired to develop the database system for the first version of this system. A basic UI is required key business operations.

## Key System Operations

The system must support the following operations:

- The company uses Sri Lanka Railways for bulk transportation of goods between Kandy and main cities: Colombo, Negombo, Galle, Matara, Jaffna, Trincomalee.
- The railway department allocates fixed cargo capacity per train trip. If an order exceeds the capacity of the intended trip, the extra quantity must be scheduled for the next available trip.
- Each product type has a train space consumption rate (e.g., 1 box of detergent consumes 0.5 units of space). The space consumption must be respected when scheduling orders to a train.
- At the destination, stores located near railway stations handle unloading and storage.
- For last-mile delivery, trucks are dispatched from the store to delivery addresses based on predefined routes. Each route covers a specific area and has a maximum delivery time.
- Each truck schedule is assigned a driver and a driver assistant. The same truck, driver, or assistant cannot be assigned to conflicting routes or overlapping times.
- Rosters for drivers and assistants must comply with the following:
  - A driver must not be scheduled for two consecutive truck deliveries
  - An assistant can only be scheduled for a maximum of two consecutive routes
  - Weekly limits: 40 hours for drivers, 60 hours for assistants
- Orders must be placed at least 7 days in advance and should be matched with the route covering the delivery address.
- An order may consist of multiple items, each with quantity and product reference. Once delivered, the status must be updated.

## Expected Management Reports

The management expects the following reports from the system:

1. Quarterly sales report (value and volume)
2. Most ordered items in a given quarter
3. City-wise and route-wise sales breakdown
4. Driver and assistant working hours report
5. Truck usage analysis per month
6. Customer order history with delivery details

## Task

Your task is to model the database design to encapsulate these requirements. It should consider all entities and relationships given in the description. Moreover, you need to identify the places where procedures, functions, and triggers can be employed to guarantee ACID properties. Foreign keys and primary keys must be set to maintain consistency. Indexing should be done when necessary.

Additionally, you must gain a domain understanding by reviewing logistics-related material and take assumptions where needed (e.g., product dimensions, route frequency). You must populate the database with at least 40 orders, 10 different routes, and the relevant delivery/trip details. You must also create a valid train schedule with defined capacities for testing.