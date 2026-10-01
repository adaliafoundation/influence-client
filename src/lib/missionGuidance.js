// Topic IDs are shared by mission requirements and the Help topic index.
export const gameplayGuides = {
  land: {
    title: "Choose your foothold",
    pages: [
      "Lea here. Click the location pin above your crew to zoom to your crew’s location on Adalia Prime. Look around the nearby surface for empty lots that are not already leased or occupied by other crews.",
      "Open the Resources pane and select a resource to see its abundance across the surface. Compare nearby lots and look for an area with reasonably abundant resources. A Warehouse nearby will help keep your future transport distances short.",
      "Click your chosen lot, then click Lease Lot. In the lease window, keep the default 30-day period, review the terms, and confirm. If you have an unused starter lease, the action is called Use Starter Lot Lease. Wait for the transaction to finish before continuing.",
      "Now that you control the lot, click Plan Building. In the planning window, click the building selector and choose Warehouse from the list. Review the site and confirm the plan.",
      "Your Warehouse now has a construction site. Planning is enough for the Make Landfall requirement; you will construct the Warehouse later. Open Objectives to check your progress and complete the mission when its requirement is met."
    ],
    highlights: ["hudCrewLocation", "hudMenuResources", "actionButtonLease", "actionButtonPlan", null]
  },
  sample: {
    title: "Prospect the surface",
    pages: [
      "Open the Resources pane and select the resource you want to prospect. The surface overlay shows where it is more abundant. Look near your crew and your planned buildings to keep travel and future transport distances manageable.",
      "Click a promising lot, then click Start Core Sample. In the sampling window, check the selected resource and the discovery minimum and maximum. Abundance helps you choose a site, but the deposit’s actual size is revealed by sampling.",
      "Check the Tool section. An available starter-pack sample includes the core drill; otherwise, select an accessible inventory containing one. Review the travel time and sampling time, then click Prospect or Prospect with Starter Pack.",
      "Let the sampling timer finish. Return to the sampled lot and click Analyze Sample, then finish the action in the window. Starting the sample alone does not reveal the deposit or finish the requirement.",
      "Inspect the revealed deposit and compare its size with the requirement in Objectives. For each distinct deposit required by the mission, start and analyze a new sample. Improving the same deposit does not give you another distinct deposit."
    ],
    highlights: ["hudMenuResources", "actionButtonCoreSample", null, "actionButtonCoreSample", null]
  },
  construct: {
    title: "Construct a building",
    pages: [
      "Check Objectives for the building you need: an Extractor, Warehouse, Refinery, Bioreactor, or Factory. Open My Assets to find your existing construction site. For the Warehouse requirement, return to the Warehouse you planned during Make Landfall.",
      "If you still need a site, choose an empty lot you control and click Plan Building. Select the building required by the mission and confirm the plan. Keep production buildings near their resource sources and storage to reduce transport distances.",
      "Select the construction site and click Start Construction. Review the required materials. If this building is covered by your starter pack, the window shows that its materials are included.",
      "If materials are not included, click Transfer from Inventory to send materials you own, or Source from Market to buy what is missing. Select the quantities and sources, confirm, and finish the deliveries. Return to Start Construction once the required materials are on site.",
      "Review the construction time and confirm Construct or Construct with Starter Pack. When the timer finishes, return to the site and click Finish Construction. Complete that action to make the building operational, then check Objectives."
    ],
    highlights: ["hudMenuMyAssets", "actionButtonPlan", "actionButtonConstruct", null, "actionButtonConstruct"]
  },
  extract: {
    title: "Extract resources",
    pages: [
      "Open My Assets and select your completed Extractor. You will need an analyzed deposit you can use and an accessible destination inventory with enough free capacity for the output.",
      "Click Extract Resource to open the extraction window. Click the Deposit selector and choose the deposit you want to work. Check the resource and the remaining yield before setting the amount.",
      "Set the extraction quantity and compare it with the requirement in Objectives. If the mission asks for a single extraction, that amount must come from one operation. Check the units displayed in the window when comparing quantities.",
      "Click the Destination selector and choose where the extracted resource will go. Check available capacity, transport time, and extraction time, then confirm the operation.",
      "When the timer finishes, return to the Extractor and click Finish Extraction. Complete the action so the output arrives in the selected inventory, then check Objectives for credit."
    ],
    highlights: ["hudMenuMyAssets", "actionButtonExtract", null, null, "actionButtonExtract"]
  },
  storage: {
    title: "Receive goods into storage",
    pages: [
      "Open My Assets and select the Warehouse you planned for the campaign. If it is still a construction site, finish its construction first. Open the completed Warehouse’s inventory and check its free storage capacity.",
      "With the Warehouse selected, click Send Here to open a delivery to it. Select an accessible source inventory containing the goods you want to store. You can also choose this Warehouse as the destination of an extraction or production operation.",
      "Choose the goods and quantities to transfer. Compare the Warehouse’s stored mass with the requirement in Objectives, and send enough to reach it. Review the destination and its capacity before confirming the delivery.",
      "Wait for the delivery timer, then return to the Warehouse and open Receive Delivery. Finish the delivery so the goods enter storage. For extraction or production output, finish that operation instead. Goods still in transit do not count as stored inventory.",
      "Open the Warehouse’s inventory to confirm the goods have arrived, then check Objectives. If the requirement is not yet met, compare the stored mass with the target and arrange another delivery."
    ],
    highlights: ["hudMenuMyAssets", null, null, null, "hudMenuMyAssets"]
  },
  refine: {
    title: "Refine resources",
    pages: [
      "Open My Assets and select your completed Refinery. You will use its Refine Materials action to turn raw materials into products for later production stages.",
      "Click Refine Materials. In the processing window, open the process selector and choose a supported recipe. Read its input and output quantities so you know what materials to supply and what you will receive.",
      "Choose the batch size. For the mission, produce at least one full recipe-equivalent. Select a source inventory containing all the required materials; arrange and finish any missing deliveries to it before starting.",
      "Select the output inventory and check that it has enough capacity. Review the inputs, output quantities, fees, and duration, then confirm the refining operation.",
      "When the timer finishes, return to the Refinery and reopen its processing action. Finish the operation to receive the refined output, then check Objectives for progress."
    ],
    highlights: ["hudMenuMyAssets", "actionButtonProcess", null, null, "actionButtonProcess"]
  },
  cultivate: {
    title: "Cultivate life",
    pages: [
      "Open My Assets and select your completed Bioreactor. You will use its Manufacture Organics action to grow biological products. Start by comparing recipes and the materials they need.",
      "Click Manufacture Organics. Open the process selector and choose a supported recipe. Read the input and output quantities, then set the batch size to cover at least one full batch for the mission.",
      "Select a source inventory that contains all the required inputs. If you are missing materials, buy, produce, or deliver them first and finish those actions before returning to the Bioreactor.",
      "Choose an output inventory with enough free capacity. Review the selected recipe, quantities, fees, and duration, then confirm the operation.",
      "When the timer finishes, return to the Bioreactor and reopen its processing action. Finish the operation to receive the biological products, then check Objectives for progress."
    ],
    highlights: ["hudMenuMyAssets", "actionButtonProcess", null, null, "actionButtonProcess"]
  },
  manufacture: {
    title: "Manufacture goods",
    pages: [
      "Open My Assets and select your completed Factory. You will use its Manufacture Goods action to turn inputs into finished products. Choose a product that will be useful to your operation.",
      "Click Manufacture Goods. Open the process selector and choose a supported recipe. Read its required inputs and expected outputs, then set a batch size that covers at least one full recipe-equivalent for the mission.",
      "Select a source inventory containing all required inputs. Arrange any missing materials by buying, producing, or delivering them, and finish those actions before starting manufacturing.",
      "Select an output inventory with room for the finished goods. Review the recipe, input and output quantities, fees, and duration, then confirm the manufacturing operation.",
      "When the timer finishes, return to the Factory and reopen its processing action. Finish the operation to receive the manufactured goods, then check Objectives for progress."
    ],
    highlights: ["hudMenuMyAssets", "actionButtonProcess", null, null, "actionButtonProcess"]
  },
  route: {
    title: "Connect production stages",
    pages: [
      "Choose an approved two-stage route. For example, Water Vacuum-evaporation Desalination produces Deionized Water, which you can then use in Water Electrolysis. Plan both stages and their input needs before spending materials on the first.",
      "Open My Assets and locate the operational buildings needed for the route. Check that you can use their processors, supply the first stage’s inputs, and store both the intermediate and final products.",
      "Select the first building and open its processing action. Choose the first recipe in your route, set a batch size of at least one full recipe, and select the input and output inventories. Produce enough intermediate material for the second stage, then start the operation.",
      "After the timer, return and finish the first operation. Note which inventory received the intermediate product. If you need to move it, arrange and finish the delivery before starting the next stage.",
      "Select the second building and open its processing action. Choose the second recipe in your route, set at least one full recipe, and supply it with the first stage’s output. Select the final output inventory, review the quantities, and start the operation.",
      "Return after the timer and finish the second operation. Check Objectives for both stages, then use the guidance for the final requirement to put some of that output to work."
    ],
    highlights: [null, "hudMenuMyAssets", "actionButtonProcess", null, "actionButtonProcess", null]
  },
  use: {
    title: "Put your output to work",
    pages: [
      "After completing both stages of your approved route, use or deliver some of its final product. Open My Assets and locate the inventory that received the output of your second production stage.",
      "To deliver it, select the building or ship holding the final product and click Send From. Choose a destination you can deliver to, select some of the final output, and review the quantity and destination before confirming.",
      "When the delivery timer finishes, open the incoming delivery at its destination and finish receiving it. Starting a delivery is not enough, and market buy or sell orders do not qualify for this requirement.",
      "For a food-resupply route, open your crew’s food resupply action and select the inventory containing the food you produced. Choose the food quantity and confirm the resupply using that inventory.",
      "Return to Objectives after the use or delivery is complete. Check that the final requirement has been recorded, then complete the mission when all of its requirements are met."
    ],
    highlights: ["hudMenuMyAssets", null, null, null, null]
  }
};

const missionTopics = {
  MAKE_LANDFALL: ['land'],
  PROSPECT_THE_SURFACE: ['sample'],
  BEGIN_EXTRACTION: ['construct', 'extract'],
  ESTABLISH_STORAGE: ['construct', 'storage'],
  REFINE_THE_YIELD: ['construct', 'refine'],
  CULTIVATE_LIFE: ['construct', 'cultivate'],
  MANUFACTURE_GOODS: ['construct', 'manufacture'],
  CLOSE_THE_PRODUCTION_LOOP: ['route', 'route', 'use']
};

export const getMissionGuide = (mission, objectiveIndex = 0) => {
  const topics = missionTopics[mission.key];
  return topics?.[Math.min(objectiveIndex, topics.length - 1)];
};

export const waitingGuidance = 'Your crew has work underway. Return to Objectives when the action is ready to finish. You can minimize this guide and click Lea’s portrait to return to the same page.';
