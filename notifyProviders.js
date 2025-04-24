// notifyProviders.js
require('dotenv').config();
const axios = require('axios');

// --- Config ---
const HEALTHIE_API_URL = process.env.HEALTHIE_API_URL;
const API_KEY = process.env.HEALTHIE_API_KEY;

// Configuration options - adjust as needed for testing
const TIME_WINDOW = {
    // In production, set this to false to use actual current time
    USE_TEST_MODE: false,  
    
    // In production: Set to 1 to check for appointments in the next hour (per requirements)
    // For testing: Use larger value (e.g., 24) to include more appointments
    HOURS_TO_CHECK: 24,
    
    // Only used when USE_TEST_MODE is true
    TEST_TIME: new Date('2025-04-24T10:00:00-07:00')  // 10am Pacific time
};

if (!HEALTHIE_API_URL || !API_KEY) {
    console.error("Missing HEALTHIE_API_URL or HEALTHIE_API_KEY in .env file.");
    process.exit(1);
}

const apiClient = axios.create({
    baseURL: HEALTHIE_API_URL,
    headers: {
        'Authorization': `Basic ${API_KEY}`,
        'Content-Type': 'application/json',
        'AuthorizationSource': 'API'
    }
});

// --- GraphQL Queries ---
const TEST_API_CONNECTION_QUERY = `
  query TestConnection {
    currentUser {
      id
      first_name
      last_name
    }
  }
`;

// Modified to get all possible appointments
const GET_USERS_WITH_APPOINTMENTS_QUERY = `
  query GetUsersWithAppointments {
    users {
      id
      first_name
      last_name
      has_completed_intake_forms
      next_app {
        id
        date
        location
        provider {
          id
          first_name
          last_name
          doc_share_id
        }
      }
      appointments {
        id
        date
        location
        provider {
          id
          first_name
          last_name
          doc_share_id
        }
      }
    }
  }
`;

const CREATE_CONVERSATION_MUTATION = `
  mutation CreateConversation($simple_added_users: String!, $name: String) {
    createConversation(input: { simple_added_users: $simple_added_users, name: $name }) {
      conversation { id }
      messages { field message }
    }
  }
`;

const CREATE_NOTE_MUTATION = `
  mutation CreateNote($user_id: String!, $content: String!, $conversation_id: String!) {
    createNote(input: { user_id: $user_id, content: $content, conversation_id: $conversation_id }) {
      note { id content user_id }
      messages { field message }
    }
  }
`;

// --- Helpers ---
async function makeGraphQLRequest(query, variables) {
    try {
        const response = await apiClient.post('', { query, variables });
        if (response.data.errors) {
            throw new Error(response.data.errors.map(e => e.message).join(', '));
        }
        return response.data.data;
    } catch (error) {
        if (error.response && error.response.data && error.response.data.errors) {
            throw new Error(error.response.data.errors.map(e => e.message).join(', '));
        }
        throw error;
    }
}

function formatToISO(date) {
    return date.toISOString();
}

async function testApiConnection() {
    try {
        await makeGraphQLRequest(TEST_API_CONNECTION_QUERY, {});
        console.log("API connection and key verified successfully.");
        return true;
    } catch (error) {
        console.error("API Connection/Key Verification Failed:", error.message);
        return false;
    }
}

// --- Main Logic ---
/**
 * Checks for upcoming appointments within the configured time window,
 * verifies if patients have completed their intake forms, and notifies 
 * providers for incomplete forms. Processes all appointments in chronological order.
 * 
 * @returns {Promise<Array>} Array of sent message logs
 */
async function notifyProvidersOfIncompleteIntake() {
    // Dynamically import chalk and boxen
    const chalk = (await import('chalk')).default;
    const boxen = (await import('boxen')).default;

    try {
        const sentMessagesLog = [];
        
        // Use test time or current time based on configuration
        const now = TIME_WINDOW.USE_TEST_MODE ? new Date(TIME_WINDOW.TEST_TIME) : new Date();
        const inFuture = new Date(now.getTime() + TIME_WINDOW.HOURS_TO_CHECK * 60 * 60 * 1000);
        
        const nowTime = now.getTime();
        const inFutureTime = inFuture.getTime();
        
        console.log(`Current time: ${now.toLocaleString()}`);
        console.log(`Checking for appointments between ${now.toLocaleString()} and ${inFuture.toLocaleString()}`);
        if (TIME_WINDOW.USE_TEST_MODE) {
            console.log(`*** TEST MODE ENABLED - Using ${TIME_WINDOW.HOURS_TO_CHECK} hour window and simulated time ***`);
        }

        // Get current user ID for sending notes
        let currentUserId = null;
        try {
            const userData = await makeGraphQLRequest(TEST_API_CONNECTION_QUERY, {});
            currentUserId = userData.currentUser.id;
            console.log(`Authenticated as user: ${userData.currentUser.first_name} ${userData.currentUser.last_name} (ID: ${currentUserId})`);
        } catch (err) {
            console.error("Could not fetch current user ID:", err.message);
            throw new Error("Failed to get current user ID for sending messages");
        }

        // Fetch all users and their appointments
        console.log("\nFetching all users and their appointments...");
        let appointmentData;
        try {
            appointmentData = await makeGraphQLRequest(GET_USERS_WITH_APPOINTMENTS_QUERY, {});
        } catch (err) {
            console.error("Error fetching users/appointments:", err.message);
            throw new Error("Failed to fetch appointment data from API");
        }

        const users = appointmentData.users || [];
        console.log(`Found ${users.length} total users in the system`);
        
        // Collect all appointments in the time window
        let appointments = [];
        
        // First, check all users' next upcoming appointment
        console.log("\nChecking next_app for each user...");
        let nextAppCount = 0;
        for (const user of users) {
            const appt = user.next_app;
            if (!appt || !appt.date) continue;
            
            nextAppCount++;
            const apptTime = new Date(appt.date).getTime();
            if (apptTime >= nowTime && apptTime <= inFutureTime) {
                // Add user data to the appointment object
                appointments.push({
                    ...appt,
                    user: {
                        id: user.id,
                        first_name: user.first_name,
                        last_name: user.last_name,
                        has_completed_intake_forms: user.has_completed_intake_forms
                    }
                });
            }
        }
        console.log(`Found ${nextAppCount} users with next_app set`);
        
        // Then, check all individual appointments for each user
        console.log("\nChecking all appointments for each user...");
        let allApptsCount = 0;
        for (const user of users) {
            const userAppointments = user.appointments || [];
            allApptsCount += userAppointments.length;
            
            for (const appt of userAppointments) {
                if (!appt || !appt.date) continue;
                
                const apptTime = new Date(appt.date).getTime();
                if (apptTime >= nowTime && apptTime <= inFutureTime) {
                    // Check if this appointment is already in our list (from next_app)
                    const isDuplicate = appointments.some(a => a.id === appt.id);
                    if (!isDuplicate) {
                        appointments.push({
                            ...appt,
                            user: {
                                id: user.id,
                                first_name: user.first_name,
                                last_name: user.last_name,
                                has_completed_intake_forms: user.has_completed_intake_forms
                            }
                        });
                    }
                }
            }
        }
        console.log(`Found ${allApptsCount} total appointments across all users`);

        if (appointments.length === 0) {
            console.log("\nNo upcoming appointments found within the configured time window.");
            return [];
        }

        // Sort appointments chronologically
        appointments.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        console.log(boxen(chalk.bold.cyan(`\nFound ${appointments.length} appointment(s) within the time window\nProcessing appointments in chronological order...`), {padding: 1, borderColor: 'cyan', borderStyle: 'round'}));
        
        // Process each appointment in chronological order
        for (let i = 0; i < appointments.length; i++) {
            const appt = appointments[i];
            const patient = appt.user;
            const provider = appt.provider;
            
            if (!patient || !provider || !provider.doc_share_id) {
                console.log(chalk.bgRed.white(`\nSkipping appointment ID ${appt.id}: Missing patient or provider information`));
                continue;
            }

            const appointmentTimeFormatted = new Date(appt.date).toLocaleString('en-US', {
                dateStyle: 'full',
                timeStyle: 'short'
            });
            
            const apptBox = boxen(`APPOINTMENT ${i+1} OF ${appointments.length}\n\n` +
                chalk.bold('Appointment ID: ') + appt.id + '\n' +
                chalk.bold('Date & Time:    ') + appointmentTimeFormatted + '\n' +
                chalk.bold('Location:      ') + (appt.location || 'Not specified') + '\n' +
                chalk.bold('Provider:      ') + `${provider.first_name} ${provider.last_name} (ID: ${provider.id})` + '\n' +
                chalk.bold('Patient:       ') + `${patient.first_name} ${patient.last_name} (ID: ${patient.id})` + '\n' +
                chalk.bold('Intake Completed: ') + (patient.has_completed_intake_forms ? chalk.green('Yes') : chalk.red('No')),
                {padding: 1, borderColor: patient.has_completed_intake_forms ? 'green' : 'yellow', borderStyle: 'round'}
            );
            console.log('\n' + apptBox);

            if (patient.has_completed_intake_forms === false) {
                console.log(chalk.bgYellow.black('Patient has not completed intake form. Sending notification to provider...'));
                
                let messageSubject, messageBody;

                // Production message
                if (!TIME_WINDOW.USE_TEST_MODE && TIME_WINDOW.HOURS_TO_CHECK === 1) {
                    messageSubject = `Incomplete Intake Form Reminder`;
                    messageBody = `Hi Dr. ${provider.last_name},\n\nYour patient, ${patient.first_name} ${patient.last_name}, has not yet completed their intake form for the upcoming appointment at ${appointmentTimeFormatted}.\n\nPlease remind them at the beginning of the session to complete it.\n\nThank you.`;
                } else {
                    // Test mode message
                    messageSubject = `[TEST] Incomplete Intake Form Reminder`;
                    messageBody = `Hi Dr. ${provider.last_name},\n\nYour patient, ${patient.first_name} ${patient.last_name}, has not yet completed their intake form for the upcoming appointment at ${appointmentTimeFormatted}.\n\n[THIS IS A TEST MESSAGE - Using ${TIME_WINDOW.HOURS_TO_CHECK} hour window]\n\nPlease remind them at the beginning of the session to complete it.\n\nThank you.`;
                }

                try {
                    // 1. Create the conversation
                    console.log(`Creating conversation with provider ${provider.first_name} ${provider.last_name}...`);
                    
                    const convoResult = await makeGraphQLRequest(CREATE_CONVERSATION_MUTATION, {
                        simple_added_users: provider.doc_share_id,
                        name: messageSubject
                    });
                    
                    const conversationId = convoResult.createConversation?.conversation?.id;
                    if (!conversationId) {
                        const errorDetail = (convoResult.createConversation?.messages || [])
                            .map(m => `${m.field}: ${m.message}`)
                            .join(', ');
                        console.error(`Failed to create conversation for Appointment ID ${appt.id}. Reason: ${errorDetail}`);
                        continue;
                    }

                    // 2. Send the note/message
                    console.log(`Sending message in conversation ${conversationId}...`);
                    
                    const noteResult = await makeGraphQLRequest(CREATE_NOTE_MUTATION, {
                        user_id: currentUserId,
                        content: messageBody,
                        conversation_id: conversationId
                    });
                    
                    if (noteResult.createNote && noteResult.createNote.note) {
                        const logMsg = `Sent message to Provider ${provider.first_name} ${provider.last_name} about Patient ${patient.first_name} ${patient.last_name}'s incomplete intake form for appointment on ${appointmentTimeFormatted}`;
                        sentMessagesLog.push(logMsg);
                        console.log(`✓ SUCCESS: ${logMsg}`);
                    } else if (noteResult.createNote && noteResult.createNote.messages && noteResult.createNote.messages.length > 0) {
                        const errorDetail = noteResult.createNote.messages
                            .map(m => `${m.field}: ${m.message}`)
                            .join(', ');
                        console.error(`Failed to send note for Appointment ID ${appt.id}. Reason: ${errorDetail}`);
                    }
                } catch (err) {
                    console.error(`Error sending message for Appointment ID ${appt.id}:`, err.message);
                }
            } else {
                console.log(chalk.bgGreen.black(`No notification needed: Patient ${patient.first_name} ${patient.last_name} has completed their intake form`));
            }
        }

        console.log(boxen(chalk.bold.magenta("\n=== NOTIFICATION PROCESS SUMMARY ===\n") +
            `Total appointments found: ${appointments.length}\n` +
            `Total notifications sent: ${sentMessagesLog.length}\n` +
            (sentMessagesLog.length > 0 ? ("\nMessages sent:\n" + sentMessagesLog.map((log, index) => `${index + 1}. ${log}`).join('\n')) : "\nNo messages were required or sent."),
            {padding: 1, borderColor: 'magenta', borderStyle: 'round'}
        ));
        
        return sentMessagesLog;
    } catch (error) {
        console.error("\n⚠️ ERROR IN NOTIFICATION PROCESS ⚠️");
        console.error(error);
        return [];
    }
}

// --- Run ---
if (require.main === module) {
    (async () => {
        try {
            // Dynamically import chalk for top-level usage
            const chalk = (await import('chalk')).default;
            console.log(chalk.bold.blue("=== INTAKE FORM NOTIFICATION SYSTEM ==="));
            console.log(`Starting process at: ${new Date().toLocaleString()}`);
            
            const connectionOk = await testApiConnection();
            if (connectionOk) {
                await notifyProvidersOfIncompleteIntake();
                console.log(`\nProcess completed successfully at: ${new Date().toLocaleString()}`);
            } else {
                console.error("\nExiting: Failed to connect to Healthie API");
                process.exitCode = 1;
            }
        } catch (error) {
            console.error("\nFatal error occurred:", error);
            process.exitCode = 1;
        }
    })();
}

module.exports = { notifyProvidersOfIncompleteIntake, testApiConnection };
