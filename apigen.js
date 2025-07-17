// Get references to DOM elements
const attributesContainer = document.getElementById('attributesContainer');
const addAttributeBtn = document.getElementById('addAttributeBtn');
const generateCodeBtn = document.getElementById('generateCodeBtn');
const copyCodeBtn = document.getElementById('copyCodeBtn');
const generatedCodeTextarea = document.getElementById('generatedCode');
const modelNameInput = document.getElementById('modelName');
const messageDiv = document.getElementById('message');

// New MongoDB connection inputs
const mongoUserIdInput = document.getElementById('mongoUserId');
const mongoPasswordInput = document.getElementById('mongoPassword');
const mongoUriInput = document.getElementById('mongoUri');
const mongoDatabaseNameInput = document.getElementById('mongoDatabaseName');


// Function to display a temporary message
function showMessage(msg, type = 'success') {
    messageDiv.textContent = msg;
    messageDiv.className = `text-center text-sm font-medium mb-4 h-5 ${type === 'success' ? 'text-green-700' : 'text-red-700'}`;
    setTimeout(() => {
        messageDiv.textContent = '';
        messageDiv.className = 'text-center text-sm font-medium mb-4 h-5';
    }, 3000);
}

// Function to add a new attribute input row
function addAttributeRow() {
    const attributeDiv = document.createElement('div');
    attributeDiv.className = 'flex flex-col sm:flex-row gap-3 items-center p-3 bg-gray-50 rounded-lg border border-gray-200';

    attributeDiv.innerHTML = `
                <input type="text" placeholder="Attribute Name (e.g., score)"
                       class="attribute-name flex-1 shadow-sm appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-1 focus:ring-indigo-400">
                <select class="attribute-type flex-none w-full sm:w-auto py-2 px-3 border border-gray-300 bg-white rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-400">
                    <option value="String">String</option>
                    <option value="Number">Number</option>
                    <option value="Boolean">Boolean</option>
                    <option value="Date">Date</option>
                </select>
                <div class="flex items-center">
                    <input type="checkbox" class="attribute-required form-checkbox h-5 w-5 text-indigo-600 rounded focus:ring-indigo-500" checked>
                    <label class="ml-2 text-gray-700 text-sm">Required</label>
                </div>
                <button class="remove-attribute-btn flex-none bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-3 rounded-lg shadow-sm transition duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2">
                    Remove
                </button>
            `;
    attributesContainer.appendChild(attributeDiv);

    // Add event listener for the remove button
    attributeDiv.querySelector('.remove-attribute-btn').addEventListener('click', () => {
        attributesContainer.removeChild(attributeDiv);
    });
}

// Add initial attribute row when the page loads
document.addEventListener('DOMContentLoaded', addAttributeRow);

// Event listener for "Add Attribute" button
addAttributeBtn.addEventListener('click', addAttributeRow);

// Event listener for "Generate API Code" button
generateCodeBtn.addEventListener('click', () => {
    const modelName = modelNameInput.value.trim();
    if (!modelName) {
        showMessage("Please enter a Collection Name.", 'error'); // Updated message
        return;
    }

    // Get MongoDB connection details
    const mongoUserId = mongoUserIdInput.value.trim();
    const mongoPassword = mongoPasswordInput.value.trim();
    const mongoUri = mongoUriInput.value.trim();
    const mongoDatabaseName = mongoDatabaseNameInput.value.trim();

    if (!mongoUserId || !mongoPassword || !mongoUri || !mongoDatabaseName) {
        showMessage("Please fill in all MongoDB connection details.", 'error');
        return;
    }

    // Construct the connection string
    const connectionString = `mongodb+srv://${mongoUserId}:${mongoPassword}@${mongoUri}/${mongoDatabaseName}`;


    // Capitalize the first letter of the model name for the Mongoose model
    const capitalizedModelName = modelName.charAt(0).toUpperCase() + modelName.slice(1);
    // Convert model name to lowercase and plural for API path (e.g., 'products', 'users')
    const apiPathName = modelName.toLowerCase() + 's'; // Simple pluralization, can be improved

    const attributeInputs = attributesContainer.querySelectorAll('.attribute-name');
    const typeSelects = attributesContainer.querySelectorAll('.attribute-type');
    const requiredCheckboxes = attributesContainer.querySelectorAll('.attribute-required'); // Get required checkboxes

    const attributes = [];
    let isValid = true;
    attributeInputs.forEach((input, index) => {
        const name = input.value.trim();
        const type = typeSelects[index].value;
        const required = requiredCheckboxes[index].checked; // Get required status
        if (!name) {
            showMessage(`Attribute name in row ${index + 1} cannot be empty.`, 'error');
            isValid = false;
            return;
        }
        attributes.push({ name, type, required }); // Store required status
    });

    if (!isValid) return;
    if (attributes.length === 0) {
        showMessage("Please add at least one attribute.", 'error');
        return;
    }

    // Generate Schema definition
    let schemaFields = attributes.map(attr => {
        const requiredProp = attr.required ? ' required: true ' : '';
        return `    ${attr.name}: { type: ${attr.type}${requiredProp ? ',' + requiredProp : ''} },`;
    }).join('\n');
    if (attributes.length > 0) {
        // Remove trailing comma from the last attribute
        schemaFields = schemaFields.slice(0, schemaFields.lastIndexOf(','));
    }

    // Generate API Code
    const generatedCode = `
'use strict';

// ############################################# //
// ##### Server Setup for ${capitalizedModelName} Management API #####
// ############################################# //

// Importing packages
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

// Initialize Express app
const app = express();
// Define the port for the server to listen on
const port = process.env.PORT || 3000; // Changed port from 5000 to 3000

// Middleware setup
// Enable CORS (Cross-Origin Resource Sharing) for all routes
app.use(cors());
// Enable Express to parse JSON formatted request bodies
app.use(express.json());

// MongoDB connection string.
// This string is generated from the inputs provided in the UI.
mongoose.connect('${connectionString}', {
    useNewUrlParser: true, // Use the new URL parser instead of the deprecated one
    useUnifiedTopology: true // Use the new server discovery and monitoring engine
})
.then(() => {
    console.log('Connected to MongoDB');
    // Start the Express server only after successfully connecting to MongoDB
    app.listen(port, () => {
        console.log('${capitalizedModelName} API Server is running on port ' + port);
    });
})
.catch((error) => {
    // Log any errors that occur during the MongoDB connection
    console.error('Error connecting to MongoDB:', error);
});


// ############################################# //
// ##### ${capitalizedModelName} Model Setup #####
// ############################################# //

// Define Mongoose Schema Class
const Schema = mongoose.Schema;

// Create a Schema object for the ${capitalizedModelName} model
// This schema defines the structure of ${modelName.toLowerCase()} documents in the MongoDB collection.
const ${modelName.toLowerCase()}Schema = new Schema({
${schemaFields}
});

// Create a Mongoose model from the ${modelName.toLowerCase()}Schema.
// This model provides an interface to interact with the '${apiPathName}' collection in MongoDB.
// Mongoose automatically pluralizes "${capitalizedModelName}" to "${apiPathName}" for the collection name.
const ${capitalizedModelName} = mongoose.model("${capitalizedModelName}", ${modelName.toLowerCase()}Schema);


// ############################################# //
// ##### ${capitalizedModelName} API Routes Setup #####
// ############################################# //

// Create an Express Router instance to handle ${modelName.toLowerCase()}-related routes.
const router = express.Router();

// Mount the router middleware at the '/api/${apiPathName}' path.
// All routes defined on this router will be prefixed with '/api/${apiPathName}'.
app.use('/api/${apiPathName}', router);

// Route to get all ${modelName.toLowerCase()}s from the database.
// Handles GET requests to '/api/${apiPathName}/'.
router.route("/")
    .get((req, res) => {
        // Find all ${modelName.toLowerCase()} documents in the '${apiPathName}' collection.
        ${capitalizedModelName}.find()
            .then((${apiPathName}) => res.json(${apiPathName})) // If successful, return ${apiPathName} as JSON.
            .catch((err) => res.status(400).json("Error: " + err)); // If error, return 400 status with error message.
    });

// Route to get a specific ${modelName.toLowerCase()} by its ID.
// Handles GET requests to '/api/${apiPathName}/:id'.
router.route("/:id")
    .get((req, res) => {
        // Find a ${modelName.toLowerCase()} document by its ID from the request parameters.
        ${capitalizedModelName}.findById(req.params.id)
            .then((${modelName.toLowerCase()}) => res.json(${modelName.toLowerCase()})) // If successful, return the ${modelName.toLowerCase()} as JSON.
            .catch((err) => res.status(400).json("Error: " + err)); // If error, return 400 status with error message.
    });

// Route to add a new ${modelName.toLowerCase()} to the database.
// Handles POST requests to '/api/${apiPathName}/add'.
router.route("/add")
    .post((req, res) => {
        // Extract attributes from the request body.
        ${attributes.map(attr => `const ${attr.name} = req.body.${attr.name};`).join('\n        ')}

        // Create a new ${capitalizedModelName} object using the extracted data.
        const new${capitalizedModelName} = new ${capitalizedModelName}({
            ${attributes.map(attr => attr.name).join(',\n            ')}
        });

        // Save the new ${modelName.toLowerCase()} document to the database.
        new${capitalizedModelName}
            .save()
            .then(() => res.json("${capitalizedModelName} added!")) // If successful, return success message.
            .catch((err) => res.status(400).json("Error: " + err)); // If error, return 400 status with error message.
    });

// Route to update an existing ${modelName.toLowerCase()} by its ID.
// Handles PUT requests to '/api/${apiPathName}/update/:id'.
router.route("/update/:id")
    .put((req, res) => {
        // Find the ${modelName.toLowerCase()} by ID.
        ${capitalizedModelName}.findById(req.params.id)
            .then((${modelName.toLowerCase()}) => {
                // Update the ${modelName.toLowerCase()}'s attributes with data from the request body.
                ${attributes.map(attr => `${modelName.toLowerCase()}.${attr.name} = req.body.${attr.name};`).join('\n                ')}

                // Save the updated ${modelName.toLowerCase()} document.
                ${modelName.toLowerCase()}
                    .save()
                    .then(() => res.json("${capitalizedModelName} updated!")) // If successful, return success message.
                    .catch((err) => res.status(400).json("Error: " + err)); // If error, return 400 status with error message.
            })
            .catch((err) => res.status(400).json("Error: " + err)); // If ${modelName.toLowerCase()} not found or other error, return 400.
    });

// Route to delete a ${modelName.toLowerCase()} by its ID.
// Handles DELETE requests to '/api/${apiPathName}/delete/:id'.
router.route("/delete/:id")
    .delete((req, res) => {
        // Find and delete the ${modelName.toLowerCase()} document by ID.
        ${capitalizedModelName}.findByIdAndDelete(req.params.id)
            .then(() => res.json("${capitalizedModelName} deleted.")) // If successful, return success message.
            .catch((err) => res.status(400).json("Error: " + err)); // If error, return 400 status with error message.
    });
`;
    generatedCodeTextarea.value = generatedCode.trim();
    showMessage("API code generated successfully!");
});

// Event listener for "Copy Code" button
copyCodeBtn.addEventListener('click', () => {
    generatedCodeTextarea.select();
    document.execCommand('copy'); // Fallback for navigator.clipboard which might not work in all environments
    showMessage("Code copied to clipboard!");
});